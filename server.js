const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 100;

// Historia jest przechowywana w pamięci serwera. Po restarcie serwera jest czyszczona.
// W przyszłości można zastąpić ją bazą danych, np. MongoDB lub PostgreSQL.
const messages = [];

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  // Każda nowa osoba od razu dostaje wcześniejsze wiadomości.
  socket.emit('chat history', messages);

  socket.on('send message', (content) => {
    if (typeof content !== 'string') return;

    const text = content.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) return;

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text,
      time: new Date().toISOString()
    };

    messages.push(message);

    // Zachowujemy rozsądny rozmiar historii w pamięci.
    if (messages.length > HISTORY_LIMIT) messages.shift();

    // Wysyłamy wiadomość do wszystkich otwartych kart, także do nadawcy.
    io.emit('new message', message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mój Komunikator działa pod adresem http://localhost:${PORT}`);
});
