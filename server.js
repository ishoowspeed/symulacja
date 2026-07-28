const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serwowanie plików statycznych (HTML/CSS/JS) z folderu "public"
app.use(express.static(path.join(__dirname, 'public')));

// Przechowujemy listę użytkowników online (tylko w pamięci)
const onlineUsers = new Map(); // socket.id -> nick

io.on('connection', (socket) => {
  console.log('Nowe połączenie:', socket.id);

  // Użytkownik ustawia swój nick i dołącza do czatu
  socket.on('join', (nick) => {
    const safeNick = (nick || 'Anonim').toString().slice(0, 20);
    onlineUsers.set(socket.id, safeNick);
    socket.broadcast.emit('system', `${safeNick} dołączył do czatu`);
    io.emit('users', Array.from(onlineUsers.values()));
  });

  // Odbieranie i przekazywanie wiadomości do wszystkich
  socket.on('message', (text) => {
    const nick = onlineUsers.get(socket.id) || 'Anonim';
    const msg = (text || '').toString().slice(0, 1000);
    if (!msg.trim()) return;
    io.emit('message', {
      nick,
      text: msg,
      time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Info że ktoś pisze
  socket.on('typing', () => {
    const nick = onlineUsers.get(socket.id) || 'Anonim';
    socket.broadcast.emit('typing', nick);
  });

  socket.on('disconnect', () => {
    const nick = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    if (nick) {
      io.emit('system', `${nick} opuścił czat`);
      io.emit('users', Array.from(onlineUsers.values()));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
