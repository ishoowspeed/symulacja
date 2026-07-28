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

// BAZA DANYCH W PAMIĘCI SERWERA
// users: Map(userId -> { userId, username, password, status, friends: [userId2, userId3] })
const users = new Map();

// Map(socket.id -> userId)
const activeSockets = new Map();

// Helper 24h time HH:MM
function getFormattedTime() {
    return new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function generateUserId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ELITE-${code}`;
}

io.on('connection', (socket) => {
    let currentUserId = null;

    // REJESTRACJA KONTA NA SERWERZE
    socket.on('register', (data, callback) => {
        const { username, password } = data;
        const cleanName = username ? username.trim() : '';
        const cleanPass = password ? password.trim() : '';

        if (!cleanName || !cleanPass) {
            return callback({ success: false, message: 'Uzupełnij wszystkie pola.' });
        }

        // Sprawdzenie czy nick zajęty
        for (let u of users.values()) {
            if (u.username.toLowerCase() === cleanName.toLowerCase()) {
                return callback({ success: false, message: 'Konto o takim nicku już istnieje na serwerze.' });
            }
        }

        const userId = generateUserId();
        const newUser = {
            userId,
            username: cleanName,
            password: cleanPass,
            status: 'AKTYWNY',
            friends: [] // Lista ID znajomych
        };

        users.set(userId, newUser);
        callback({ success: true, user: { userId: newUser.userId, username: newUser.username, status: newUser.status, friends: newUser.friends } });
    });

    // LOGOWANIE DO KONTA NA SERWERZE
    socket.on('login', (data, callback) => {
        const { username, password } = data;
        const cleanName = username ? username.trim() : '';
        const cleanPass = password ? password.trim() : '';

        let foundUser = null;
        for (let u of users.values()) {
            if (u.username.toLowerCase() === cleanName.toLowerCase()) {
                foundUser = u;
                break;
            }
        }

        if (!foundUser || foundUser.password !== cleanPass) {
            return callback({ success: false, message: 'Nieprawidłowy nick lub hasło.' });
        }

        currentUserId = foundUser.userId;
        activeSockets.set(socket.id, currentUserId);

        socket.join('GŁÓWNY');

        callback({
            success: true,
            user: {
                userId: foundUser.userId,
                username: foundUser.username,
                status: foundUser.status,
                friends: foundUser.friends
            }
        });

        io.to('GŁÓWNY').emit('system_message', {
            text: `${foundUser.username} dołączył(a) do serwera.`,
            timestamp: getFormattedTime()
        });
    });

    // ZMIANA STATUSU
    socket.on('change_status', (newStatus) => {
        if (!currentUserId || !users.has(currentUserId)) return;
        const validStatuses = ['AKTYWNY', 'NIE PRZESZKADZAC', 'NIEAKTYWNY'];
        if (!validStatuses.includes(newStatus)) return;

        const user = users.get(currentUserId);
        user.status = newStatus;

        io.emit('user_status_changed', { userId: currentUserId, status: newStatus });
    });

    // DODAWANIE ZNAJOMEGO NA SERWERZE
    socket.on('add_friend', (targetUserId, callback) => {
        if (!currentUserId || !users.has(currentUserId)) {
            return callback({ success: false, message: 'Brak autoryzacji.' });
        }

        const cleanTargetId = targetUserId ? targetUserId.trim().toUpperCase() : '';

        if (cleanTargetId === currentUserId) {
            return callback({ success: false, message: 'Nie możesz dodać siebie do znajomych.' });
        }

        if (!users.has(cleanTargetId)) {
            return callback({ success: false, message: 'Nie znaleziono użytkownika o takim ID na serwerze.' });
        }

        const currentUser = users.get(currentUserId);
        const targetUser = users.get(cleanTargetId);

        if (!currentUser.friends.includes(cleanTargetId)) {
            currentUser.friends.push(cleanTargetId);
        }

        // Dodanie również po drugiej stronie (dwustronna relacja)
        if (!targetUser.friends.includes(currentUserId)) {
            targetUser.friends.push(currentUserId);
        }

        callback({
            success: true,
            friend: {
                userId: targetUser.userId,
                username: targetUser.username,
                status: targetUser.status
            },
            myFriends: currentUser.friends
        });
    });

    // POBRANIE DANYCH ZNAJOMYCH
    socket.on('get_friends_details', (friendIds, callback) => {
        const details = [];
        if (Array.isArray(friendIds)) {
            friendIds.forEach(id => {
                if (users.has(id)) {
                    const u = users.get(id);
                    details.push({ userId: u.userId, username: u.username, status: u.status });
                }
            });
        }
        callback(details);
    });

    // WIADOMOŚĆ GLOBALNA
    socket.on('send_global_message', (data) => {
        if (!currentUserId || !users.has(currentUserId)) return;
        const msgText = data.text?.trim();
        if (!msgText) return;

        const user = users.get(currentUserId);
        io.to('GŁÓWNY').emit('new_global_message', {
            senderName: user.username,
            senderId: user.userId,
            text: msgText,
            timestamp: getFormattedTime()
        });
    });

    // WIADOMOŚĆ PRYWATNA (PV)
    socket.on('send_private_message', (data) => {
        if (!currentUserId || !users.has(currentUserId)) return;
        const { targetUserId, text } = data;
        const msgText = text?.trim();
        if (!msgText || !targetUserId) return;

        const cleanTargetId = targetUserId.trim().toUpperCase();
        const currentUser = users.get(currentUserId);

        const payload = {
            senderName: currentUser.username,
            senderId: currentUser.userId,
            targetUserId: cleanTargetId,
            text: msgText,
            timestamp: getFormattedTime()
        };

        // Znajdź socket odbiorcy
        let delivered = false;
        for (let [sId, uId] of activeSockets.entries()) {
            if (uId === cleanTargetId) {
                io.to(sId).emit('new_private_message', payload);
                delivered = true;
            }
        }

        // Zwrotka do nadawcy
        socket.emit('new_private_message', payload);
    });

    socket.on('disconnect', () => {
        if (currentUserId && users.has(currentUserId)) {
            const user = users.get(currentUserId);
            activeSockets.delete(socket.id);
            io.to('GŁÓWNY').emit('system_message', {
                text: `${user.username} opuścił(a) serwer.`,
                timestamp: getFormattedTime()
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serwer ELITE działa na porcie ${PORT}`);
});
