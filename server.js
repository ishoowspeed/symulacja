const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Użytkownik połączony:', socket.id);

    socket.on('join', (username) => {
        socket.username = username || 'Anonim';
        io.emit('system message', `${socket.username} dołączył(a) do czatu.`);
    });

    socket.on('chat message', (data) => {
        io.emit('chat message', {
            user: socket.username || 'Anonim',
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('system message', `${socket.username} opuścił(a) czat.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serwer uruchomiony na http://localhost:${PORT}`);
});
