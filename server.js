const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Połączenie z bazą Neon.tech
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Automatyczna inicjalizacja tabel w bazie danych
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'Online',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Dodanie kolumny status, jeśli nie istnieje w starszej wersji bazy
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Online';
    `);

    console.log('Baza danych jest gotowa.');
  } catch (err) {
    console.error('Błąd podczas inicjalizacji bazy danych:', err);
  }
}
initDb();

// Endpoint Rejestracji
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Podaj nazwę użytkownika i hasło.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password, status) VALUES ($1, $2, $3) RETURNING id, username, status',
      [username, password, 'Online']
    );
    res.status(201).json({ success: true, message: 'Konto utworzone pomyślnie!', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Użytkownik o takiej nazwie już istnieje.' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd serwera podczas rejestracji.' });
  }
});

// Endpoint Logowania
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, username, status FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Zalogowano pomyślnie!', user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Nieprawidłowy login lub hasło.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd serwera podczas logowania.' });
  }
});

// Endpoint Aktualizacji Profilu (Nazwa, Hasło, Status)
app.post('/api/update-profile', async (req, res) => {
  const { userId, newUsername, newPassword, newStatus } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'Brak ID użytkownika.' });
  }

  try {
    // Sprawdzenie, czy nowa nazwa użytkownika nie jest zajęta przez kogoś innego
    if (newUsername) {
      const checkUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [newUsername, userId]
      );
      if (checkUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Ta nazwa użytkownika jest już zajęta.' });
      }
    }

    // Pobranie obecnych danych użytkownika
    const currentRes = await pool.query('SELECT username, password, status FROM users WHERE id = $1', [userId]);
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Użytkownik nie istnieje.' });
    }

    const current = currentRes.rows[0];
    const usernameToSet = newUsername && newUsername.trim() !== '' ? newUsername.trim() : current.username;
    const passwordToSet = newPassword && newPassword.trim() !== '' ? newPassword.trim() : current.password;
    const statusToSet = newStatus || current.status;

    // Jeżeli zmieniła się nazwa użytkownika, zaktualizujmy też autora w tabeli messages dla spójności
    if (usernameToSet !== current.username) {
      await pool.query('UPDATE messages SET username = $1 WHERE username = $2', [usernameToSet, current.username]);
    }

    const updatedRes = await pool.query(
      'UPDATE users SET username = $1, password = $2, status = $3 WHERE id = $4 RETURNING id, username, status',
      [usernameToSet, passwordToSet, statusToSet, userId]
    );

    res.json({ success: true, message: 'Profil zaktualizowany pomyślnie!', user: updatedRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd podczas aktualizacji profilu.' });
  }
});

// Endpoint Pobierania Historii Wiadomości
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, content, created_at FROM messages ORDER BY id ASC LIMIT 100'
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd podczas pobierania wiadomości.' });
  }
});

// WebSocket dla czatu w czasie rzeczywistym
wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'message' && parsed.username && parsed.content) {
        const insertRes = await pool.query(
          'INSERT INTO messages (username, content) VALUES ($1, $2) RETURNING username, content, created_at',
          [parsed.username, parsed.content]
        );

        const newMsg = insertRes.rows[0];
        const broadcastData = JSON.stringify({
          type: 'new_message',
          message: newMsg
        });

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastData);
          }
        });
      }
    } catch (err) {
      console.error('Błąd WebSocket:', err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
