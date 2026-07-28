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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Mapa aktywnych połączeń WebSocket: userId -> WebSocket
const activeSockets = new Map();

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

      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        friend_id INT REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        sender_id INT REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Online';
    `);

    console.log('Baza danych została zainicjalizowana.');
  } catch (err) {
    console.error('Błąd inicjalizacji bazy danych:', err);
  }
}
initDb();

// Helper: ustalenie efektywnego statusu
function getEffectiveStatus(user) {
  if (!activeSockets.has(user.id)) {
    return 'Offline';
  }
  return user.status || 'Online';
}

// Rejestracja
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Podaj nazwę użytkownika i hasło.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password, status) VALUES ($1, $2, $3) RETURNING id, username, status',
      [username.trim(), password, 'Online']
    );
    res.status(201).json({ success: true, message: 'Konto utworzone pomyślnie!', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Użytkownik o takiej nazwie już istnieje.' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd serwera.' });
  }
});

// Logowanie
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, status FROM users WHERE username = $1 AND password = $2',
      [username.trim(), password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({ success: true, message: 'Zalogowano!', user });
    } else {
      res.status(401).json({ success: false, message: 'Nieprawidłowy login lub hasło.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd serwera.' });
  }
});

// Edycja Profilu
app.post('/api/update-profile', async (req, res) => {
  const { userId, newUsername, newPassword, newStatus } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'Brak ID użytkownika.' });

  try {
    if (newUsername) {
      const checkUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [newUsername.trim(), userId]
      );
      if (checkUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Ta nazwa jest zajęta.' });
      }
    }

    const currentRes = await pool.query('SELECT username, password, status FROM users WHERE id = $1', [userId]);
    if (currentRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Użytkownik nie istnieje.' });

    const current = currentRes.rows[0];
    const usernameToSet = newUsername && newUsername.trim() !== '' ? newUsername.trim() : current.username;
    const passwordToSet = newPassword && newPassword.trim() !== '' ? newPassword.trim() : current.password;
    const statusToSet = newStatus || current.status;

    if (usernameToSet !== current.username) {
      await pool.query('UPDATE messages SET username = $1 WHERE username = $2', [usernameToSet, current.username]);
    }

    const updatedRes = await pool.query(
      'UPDATE users SET username = $1, password = $2, status = $3 WHERE id = $4 RETURNING id, username, status',
      [usernameToSet, passwordToSet, statusToSet, userId]
    );

    const updatedUser = updatedRes.rows[0];
    broadcastUserStatusUpdate(updatedUser.id);

    res.json({ success: true, message: 'Profil zaktualizowany!', user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd profilu.' });
  }
});

// Wiadomości Ogólne
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.username, m.content, m.created_at, u.id as user_id, u.status 
      FROM messages m 
      LEFT JOIN users u ON m.username = u.username 
      ORDER BY m.id ASC LIMIT 100
    `);

    const messages = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      content: row.content,
      created_at: row.created_at,
      status: row.user_id ? (activeSockets.has(row.user_id) ? (row.status || 'Online') : 'Offline') : 'Offline'
    }));

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd wiadomości.' });
  }
});

// Dodawanie znajomego
app.post('/api/add-friend', async (req, res) => {
  const { userId, friendUsername } = req.body;
  if (!userId || !friendUsername) {
    return res.status(400).json({ success: false, message: 'Podaj nazwę użytkownika.' });
  }

  try {
    const friendRes = await pool.query('SELECT id, username, status FROM users WHERE username = $1', [friendUsername.trim()]);
    if (friendRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nie znaleziono użytkownika o takiej nazwie.' });
    }

    const friend = friendRes.rows[0];
    if (friend.id === userId) {
      return res.status(400).json({ success: false, message: 'Nie możesz dodać samego siebie.' });
    }

    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, friend.id]
    );

    res.json({ success: true, message: 'Dodano znajomego!', friend: {
      id: friend.id,
      username: friend.username,
      status: activeSockets.has(friend.id) ? (friend.status || 'Online') : 'Offline'
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd dodawania znajomego.' });
  }
});

// Pobieranie listy znajomych
app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.status 
      FROM friends f 
      JOIN users u ON f.friend_id = u.id 
      WHERE f.user_id = $1
    `, [userId]);

    const friends = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      status: activeSockets.has(u.id) ? (u.status || 'Online') : 'Offline'
    }));

    res.json({ success: true, friends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd znajomych.' });
  }
});

// Pobieranie wiadomości prywatnych
app.get('/api/private-messages/:userId/:friendId', async (req, res) => {
  const { userId, friendId } = req.params;
  try {
    const result = await pool.query(`
      SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.created_at, u.username as sender_username
      FROM private_messages pm
      JOIN users u ON pm.sender_id = u.id
      WHERE (pm.sender_id = $1 AND pm.receiver_id = $2)
         OR (pm.sender_id = $2 AND pm.receiver_id = $1)
      ORDER BY pm.id ASC LIMIT 100
    `, [userId, friendId]);

    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd wiadomości prywatnych.' });
  }
});

// Powiadomienie wszystkich o zmianie stanu/statusu
async function broadcastUserStatusUpdate(userId) {
  try {
    const userRes = await pool.query('SELECT id, username, status FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const user = userRes.rows[0];
    const effStatus = activeSockets.has(user.id) ? (user.status || 'Online') : 'Offline';

    const payload = JSON.stringify({
      type: 'status_update',
      userId: user.id,
      username: user.username,
      status: effStatus
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  } catch (err) {
    console.error(err);
  }
}

// WebSocket
wss.on('connection', (ws) => {
  let authenticatedUserId = null;

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'auth') {
        authenticatedUserId = parsed.userId;
        activeSockets.set(authenticatedUserId, ws);
        broadcastUserStatusUpdate(authenticatedUserId);
      }

      if (parsed.type === 'message' && parsed.userId && parsed.content) {
        const userRes = await pool.query('SELECT username, status FROM users WHERE id = $1', [parsed.userId]);
        if (userRes.rows.length === 0) return;
        const user = userRes.rows[0];

        const insertRes = await pool.query(
          'INSERT INTO messages (username, content) VALUES ($1, $2) RETURNING id, username, content, created_at',
          [user.username, parsed.content]
        );

        const newMsg = {
          ...insertRes.rows[0],
          status: user.status || 'Online'
        };

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

      if (parsed.type === 'private_message' && parsed.senderId && parsed.receiverId && parsed.content) {
        const insertRes = await pool.query(
          'INSERT INTO private_messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING id, sender_id, receiver_id, content, created_at',
          [parsed.senderId, parsed.receiverId, parsed.content]
        );

        const senderRes = await pool.query('SELECT username FROM users WHERE id = $1', [parsed.senderId]);
        const senderUsername = senderRes.rows[0]?.username || 'Ktoś';

        const pmPayload = JSON.stringify({
          type: 'new_private_message',
          message: {
            ...insertRes.rows[0],
            sender_username: senderUsername
          }
        });

        // Wyślij do odbiorcy i nadawcy
        const receiverSocket = activeSockets.get(parsed.receiverId);
        if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
          receiverSocket.send(pmPayload);
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pmPayload);
        }
      }
    } catch (err) {
      console.error('Błąd WebSocket:', err);
    }
  });

  ws.on('close', () => {
    if (authenticatedUserId) {
      activeSockets.delete(authenticatedUserId);
      broadcastUserStatusUpdate(authenticatedUserId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
