const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store connected users: socket.id -> { userId, username }
const users = new Map();
// Store user lookup by custom short userId
const userIdToSocket = new Map();

function generateUserId() {
    return 'ELITE-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

io.on('connection', (socket) => {
    let currentUser = null;

    socket.on('join', (requestedUsername) => {
        const username = requestedUsername?.trim() || 'Anonim_' + Math.floor(1000 + Math.random() * 9000);
        const userId = generateUserId();

        currentUser = {
            id: socket.id,
            userId: userId,
            username: username
        };

        users.set(socket.id, currentUser);
        userIdToSocket.set(userId, socket.id);

        // Send user their assigned profile info
        socket.emit('init_profile', {
            username: currentUser.username,
            userId: currentUser.userId
        });

        // Notify global channel about user arrival
        socket.join('GŁÓWNY');
        io.to('GŁÓWNY').emit('system_message', {
            text: `${currentUser.username} dołączył(a) do serwera ELITE.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Handle messages in main channel (GŁÓWNY)
    socket.on('send_global_message', (data) => {
        if (!currentUser) return;
        const msgText = data.text?.trim();
        if (!msgText) return;

        io.to('GŁÓWNY').emit('new_global_message', {
            senderName: currentUser.username,
            senderId: currentUser.userId,
            text: msgText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Handle Private / Direct Messages
    socket.on('send_private_message', (data) => {
        if (!currentUser) return;
        const { targetUserId, text } = data;
        const msgText = text?.trim();
        if (!msgText || !targetUserId) return;

        const targetSocketId = userIdToSocket.get(targetUserId.trim().toUpperCase());

        if (!targetSocketId || !users.has(targetSocketId)) {
            socket.emit('private_error', { error: `Użytkownik o ID "${targetUserId}" nie jest zalogowany lub nie istnieje.` });
            return;
        }

        const payload = {
            senderName: currentUser.username,
            senderId: currentUser.userId,
            targetUserId: targetUserId.trim().toUpperCase(),
            text: msgText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // Send to receiver
        io.to(targetSocketId).emit('new_private_message', payload);
        // Send back to sender for confirmation
        socket.emit('new_private_message', payload);
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            userIdToSocket.delete(currentUser.userId);
            users.delete(socket.id);
            io.to('GŁÓWNY').emit('system_message', {
                text: `${currentUser.username} opuścił(a) serwer.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serwer ELITE działa na porcie ${PORT}`);
});
