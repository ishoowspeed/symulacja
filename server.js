const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statyczne pliki (frontend) z folderu public
app.use(express.static(path.join(__dirname, 'public')));

// Przechowywanie wiadomości w pamięci (znika po restarcie serwera)
let messages = [];
const MAX_MESSAGES = 200;

io.on('connection', (socket) => {
  console.log('Ktos sie polaczyl:', socket.id);

  // Wyslij historie wiadomosci nowo polaczonemu uzytkownikowi
  socket.emit('history', messages);

  socket.on('send_message', (data) => {
    const nick = (data.nick || 'Anonim').toString().slice(0, 30);
    const text = (data.text || '').toString().slice(0, 1000);

    if (!text.trim()) return;

    const message = {
      nick,
      text,
      time: new Date().toLocaleTimeString('pl-PL')
    };

    messages.push(message);
    if (messages.length > MAX_MESSAGES) {
      messages.shift();
    }

    io.emit('new_message', message);
  });

  socket.on('disconnect', () => {
    console.log('Uzytkownik rozlaczony:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serwer ELITE dziala na porcie ${PORT}`);
});
