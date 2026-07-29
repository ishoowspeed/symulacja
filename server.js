const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Przechowywanie wiadomości w pamięci
let messages = [];
let connectedUsers = new Map(); // socket.id -> username

io.on('connection', (socket) => {
  console.log('Nowe połączenie:', socket.id);

  // Wyszlij historię wiadomości do nowo połączonego klienta
  socket.emit('init-messages', messages);

  // Logowanie / ustawienie nazwy użytkownika
  socket.on('user-login', (username) => {
    connectedUsers.set(socket.id, username);
    io.emit('user-list', Array.from(new Set(connectedUsers.values())));
  });

  // Wysyłanie nowej wiadomości
  socket.on('send-message', (data) => {
    const newMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      author: data.author,
      text: data.text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      edited: false
    };

    messages.push(newMessage);
    io.emit('new-message', newMessage);
  });

  // Edytowanie wiadomości
  socket.on('edit-message', (data) => {
    const { id, newText, username } = data;
    const msg = messages.find(m => m.id === id);

    if (msg && msg.author === username) {
      msg.text = newText;
      msg.edited = true;
      io.emit('message-edited', { id, newText, edited: true });
    }
  });

  // Usuwanie wiadomości
  socket.on('delete-message', (data) => {
    const { id, username } = data;
    const index = messages.findIndex(m => m.id === id);

    if (index !== -1 && messages[index].author === username) {
      messages.splice(index, 1);
      io.emit('message-deleted', { id });
    }
  });

  // Rozłączenie
  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    io.emit('user-list', Array.from(new Set(connectedUsers.values())));
    console.log('Rozłączono:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer uruchomiony na portu http://localhost:${PORT}`);
});
