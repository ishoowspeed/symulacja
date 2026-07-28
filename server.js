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

// Polaczenie z baza Neon.tech pobierane ze zmiennej DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Automatyczna inicjalizacja tabel w bazie danych (uzytkownicy i wiadomosci czatu)
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Baza danych (users + messages) jest gotowa.');
  } catch (err) {
    console.error('Blad podczas inicjalizacji bazy danych:', err);
  }
}
initDb();

// Endpoint Rejestracji
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Podaj nazwe uzytkownika i haslo.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.status(201).json({ success: true, message: 'Konto utworzone!', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Uzytkownik o takiej nazwie juz istnieje.' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Blad serwera podczas rejestracji.' });
  }
});

// Endpoint Logowania
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Zalogowano pomyslnie!', user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Nieprawidlowy login lub haslo.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Blad serwera podczas logowania.' });
  }
});

// Endpoint Pobierania Historii Wiadomosci
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, content, created_at FROM messages ORDER BY id ASC LIMIT 100'
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Blad podczas pobierania wiadomosci.' });
  }
});

// Obsluga WebSocket dla czatu w czasie rzeczywistym
wss.on('connection', (ws) => {
  console.log('Nowy uzytkownik polaczyl sie z czatem WebSocket.');

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'message' && parsed.username && parsed.content) {
        // Zapis do bazy Neon.tech
        const insertRes = await pool.query(
          'INSERT INTO messages (username, content) VALUES ($1, $2) RETURNING username, content, created_at',
          [parsed.username, parsed.content]
        );

        const newMsg = insertRes.rows[0];
        const broadcastData = JSON.stringify({
          type: 'new_message',
          message: newMsg
        });

        // Rozeslanie nowej wiadomosci do WSZYSTKICH podlaczonych uzytkownikow
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastData);
          }
        });
      }
    } catch (err) {
      console.error('Blad obslugi wiadomosci WebSocket:', err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer Discord Clone dziala na porcie ${PORT}`);
});
