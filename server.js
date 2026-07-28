const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_NICKNAME_LENGTH = 24;
const HISTORY_LIMIT = 100;
const messages = [];

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.emit('chat history', messages);

  socket.on('send message', (payload) => {
    if (!payload || typeof payload.text !== 'string' || typeof payload.nickname !== 'string' || typeof payload.clientId !== 'string') return;

    const text = payload.text.trim();
    const nickname = payload.nickname.trim().replace(/\s+/g, ' ');
    const clientId = payload.clientId.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH || !nickname || nickname.length > MAX_NICKNAME_LENGTH || !clientId || clientId.length > 80) return;

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      clientId,
      nickname,
      text,
      time: new Date().toISOString()
    };

    messages.push(message);
    if (messages.length > HISTORY_LIMIT) messages.shift();
    io.emit('new message', message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`ELITE działa pod adresem http://localhost:${PORT}`);
});
