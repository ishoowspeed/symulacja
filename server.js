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
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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
        is_edited BOOLEAN DEFAULT FALSE,
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
        is_edited BOOLEAN DEFAULT FALSE,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Online';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
      ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
      ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
    `);

    console.log('Baza danych została zainicjalizowana.');
  } catch (err) {
    console.error('Błąd inicjalizacji bazy danych:', err);
  }
}
initDb();

// Helper: transmisja zmiany statusu użytkownika
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

// Wiadomości Ogólne - Pobieranie
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.username, m.content, m.is_edited, m.created_at, u.id as user_id, u.status 
      FROM messages m 
      LEFT JOIN users u ON m.username = u.username 
      ORDER BY m.id ASC LIMIT 100
    `);

    const messages = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      content: row.content,
      is_edited: row.is_edited || false,
      created_at: row.created_at,
      user_id: row.user_id,
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

    res.json({
      success: true,
      message: 'Dodano znajomego!',
      friend: {
        id: friend.id,
        username: friend.username,
        status: activeSockets.has(friend.id) ? (friend.status || 'Online') : 'Offline',
        unread_count: 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd dodawania znajomego.' });
  }
});

// Pobieranie listy znajomych (z liczbą nieprzeczytanych wiadomości)
app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.status,
        (SELECT COUNT(*)::int FROM private_messages pm 
         WHERE pm.sender_id = u.id AND pm.receiver_id = $1 AND pm.is_read = FALSE) as unread_count
      FROM friends f 
      JOIN users u ON f.friend_id = u.id 
      WHERE f.user_id = $1
    `, [userId]);

    const friends = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      status: activeSockets.has(u.id) ? (u.status || 'Online') : 'Offline',
      unread_count: u.unread_count || 0
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
    // Oznacz wiadomości od friendId do userId jako przeczytane
    await pool.query(
      'UPDATE private_messages SET is_read = TRUE WHERE sender_id = $2 AND receiver_id = $1 AND is_read = FALSE',
      [userId, friendId]
    );

    const result = await pool.query(`
      SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.is_edited, pm.created_at, u.username as sender_username, u.status as sender_status
      FROM private_messages pm
      JOIN users u ON pm.sender_id = u.id
      WHERE (pm.sender_id = $1 AND pm.receiver_id = $2)
         OR (pm.sender_id = $2 AND pm.receiver_id = $1)
      ORDER BY pm.id ASC LIMIT 100
    `, [userId, friendId]);

    // Dodaj aktualny status z gniazd websocket do wyniku API
    const messages = result.rows.map(row => ({
      ...row,
      sender_status: activeSockets.has(row.sender_id) ? (row.sender_status || 'Online') : 'Offline'
    }));

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd wiadomości prywatnych.' });
  }
});

// Oznaczenie wiadomości prywatnych jako przeczytane
app.post('/api/mark-read', async (req, res) => {
  const { userId, friendId } = req.body;
  try {
    await pool.query(
      'UPDATE private_messages SET is_read = TRUE WHERE sender_id = $2 AND receiver_id = $1',
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Błąd oznaczania jako przeczytane.' });
  }
});

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

      // NOWA WIADOMOŚĆ OGÓLNA
      if (parsed.type === 'message' && parsed.userId && parsed.content) {
        const userRes = await pool.query('SELECT username, status FROM users WHERE id = $1', [parsed.userId]);
        if (userRes.rows.length === 0) return;
        const user = userRes.rows[0];

        const insertRes = await pool.query(
          'INSERT INTO messages (username, content) VALUES ($1, $2) RETURNING id, username, content, is_edited, created_at',
          [user.username, parsed.content]
        );

        const newMsg = {
          ...insertRes.rows[0],
          user_id: parsed.userId,
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

      // EDYCJA WIADOMOŚCI OGÓLNEJ
      if (parsed.type === 'edit_message' && parsed.messageId && parsed.userId && parsed.content) {
        const msgRes = await pool.query('SELECT m.id, m.username, u.id as user_id FROM messages m JOIN users u ON m.username = u.username WHERE m.id = $1', [parsed.messageId]);
        if (msgRes.rows.length > 0 && msgRes.rows[0].user_id === parsed.userId) {
          await pool.query('UPDATE messages SET content = $1, is_edited = TRUE WHERE id = $2', [parsed.content, parsed.messageId]);
          
          const editPayload = JSON.stringify({
            type: 'message_edited',
            messageId: parsed.messageId,
            content: parsed.content,
            is_edited: true
          });

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(editPayload);
          });
        }
      }

      // USUWANIE WIADOMOŚCI OGÓLNEJ
      if (parsed.type === 'delete_message' && parsed.messageId && parsed.userId) {
        const msgRes = await pool.query('SELECT m.id, m.username, u.id as user_id FROM messages m JOIN users u ON m.username = u.username WHERE m.id = $1', [parsed.messageId]);
        if (msgRes.rows.length > 0 && msgRes.rows[0].user_id === parsed.userId) {
          await pool.query('DELETE FROM messages WHERE id = $1', [parsed.messageId]);

          const deletePayload = JSON.stringify({
            type: 'message_deleted',
            messageId: parsed.messageId
          });

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(deletePayload);
          });
        }
      }

      // NOWA WIADOMOŚĆ PRYWATNA
      if (parsed.type === 'private_message' && parsed.senderId && parsed.receiverId && parsed.content) {
        const isRead = parsed.isCurrentChatActive ? true : false;
        const insertRes = await pool.query(
          'INSERT INTO private_messages (sender_id, receiver_id, content, is_read) VALUES ($1, $2, $3, $4) RETURNING id, sender_id, receiver_id, content, is_edited, is_read, created_at',
          [parsed.senderId, parsed.receiverId, parsed.content, isRead]
        );

        const senderRes = await pool.query('SELECT username, status FROM users WHERE id = $1', [parsed.senderId]);
        const senderUsername = senderRes.rows[0]?.username || 'Ktoś';
        const senderStatus = senderRes.rows[0]?.status || 'Online';
        const effSenderStatus = activeSockets.has(parsed.senderId) ? senderStatus : 'Offline';

        const pmPayload = JSON.stringify({
          type: 'new_private_message',
          message: {
            ...insertRes.rows[0],
            sender_username: senderUsername,
            sender_status: effSenderStatus
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

      // EDYCJA WIADOMOŚCI PRYWATNEJ
      if (parsed.type === 'edit_private_message' && parsed.messageId && parsed.userId && parsed.content) {
        const pmRes = await pool.query('SELECT * FROM private_messages WHERE id = $1', [parsed.messageId]);
        if (pmRes.rows.length > 0 && pmRes.rows[0].sender_id === parsed.userId) {
          await pool.query('UPDATE private_messages SET content = $1, is_edited = TRUE WHERE id = $2', [parsed.content, parsed.messageId]);
          const pm = pmRes.rows[0];

          const editPmPayload = JSON.stringify({
            type: 'private_message_edited',
            messageId: parsed.messageId,
            content: parsed.content,
            is_edited: true,
            senderId: pm.sender_id,
            receiverId: pm.receiver_id
          });

          const recSocket = activeSockets.get(pm.receiver_id);
          if (recSocket && recSocket.readyState === WebSocket.OPEN) recSocket.send(editPmPayload);
          if (ws.readyState === WebSocket.OPEN) ws.send(editPmPayload);
        }
      }

      // USUWANIE WIADOMOŚCI PRYWATNEJ
      if (parsed.type === 'delete_private_message' && parsed.messageId && parsed.userId) {
        const pmRes = await pool.query('SELECT * FROM private_messages WHERE id = $1', [parsed.messageId]);
        if (pmRes.rows.length > 0 && pmRes.rows[0].sender_id === parsed.userId) {
          const pm = pmRes.rows[0];
          await pool.query('DELETE FROM private_messages WHERE id = $1', [parsed.messageId]);

          const deletePmPayload = JSON.stringify({
            type: 'private_message_deleted',
            messageId: parsed.messageId,
            senderId: pm.sender_id,
            receiverId: pm.receiver_id
          });

          const recSocket = activeSockets.get(pm.receiver_id);
          if (recSocket && recSocket.readyState === WebSocket.OPEN) recSocket.send(deletePmPayload);
          if (ws.readyState === WebSocket.OPEN) ws.send(deletePmPayload);
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
