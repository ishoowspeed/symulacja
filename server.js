const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// In-memory connected sockets map: userId -> socket.id
const activeUserSockets = new Map();

io.on('connection', (socket) => {
    let currentUser = null;

    // User register or login via client state
    socket.on('login_user', (userData) => {
        const { userId, username } = userData;
        if (!userId || !username) return;

        currentUser = { userId, username };
        activeUserSockets.set(userId, socket.id);

        socket.join('GŁÓWNY');

        // Broadcast user joined
        io.to('GŁÓWNY').emit('system_message', {
            text: `${username} dołączył(a) do serwera ELITE.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Handle Global Messages
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

    // Handle Direct / Private Messages
    socket.on('send_private_message', (data) => {
        if (!currentUser) return;
        const { targetUserId, text } = data;
        const msgText = text?.trim();
        if (!msgText || !targetUserId) return;

        const cleanTargetId = targetUserId.trim().toUpperCase();
        const payload = {
            senderName: currentUser.username,
            senderId: currentUser.userId,
            targetUserId: cleanTargetId,
            text: msgText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const targetSocketId = activeUserSockets.get(cleanTargetId);

        if (targetSocketId) {
            // Deliver directly to target if online
            io.to(targetSocketId).emit('new_private_message', payload);
        }
        
        // Always emit back to sender so sender UI updates
        socket.emit('new_private_message', payload);
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            activeUserSockets.delete(currentUser.userId);
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
