const socket = io();

// LocalStorage Keys
const STORAGE_USERS_KEY = 'ELITE_REGISTERED_USERS';
const STORAGE_CURRENT_USER = 'ELITE_LOGGED_USER';

// State
let loggedUser = null; // { username, userId, password }
let activeChat = { type: 'global', id: 'GŁÓWNY', name: 'GŁÓWNY' };
const globalMessages = [];

// DOM Elements - Auth Modal
const loginModal = document.getElementById('login-modal');
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const regUsernameInput = document.getElementById('reg-username');
const regPasswordInput = document.getElementById('reg-password');

// DOM Elements - Sidebar & Profile
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

const myAvatar = document.getElementById('my-avatar');
const myUsernameEl = document.getElementById('my-username');
const myUseridEl = document.getElementById('my-userid');
const logoutBtn = document.getElementById('logout-btn');

const btnChannelMain = document.getElementById('btn-channel-main');
const btnAddDm = document.getElementById('btn-add-dm');
const dmList = document.getElementById('dm-list');

// DOM Elements - Chat Area
const chatTypeIcon = document.getElementById('chat-type-icon');
const chatTitleName = document.getElementById('chat-title-name');
const chatTitleDesc = document.getElementById('chat-title-desc');
const messagesContainer = document.getElementById('messages-container');
const bannerTitle = document.getElementById('banner-title');
const bannerSub = document.getElementById('banner-sub');

const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// DOM Elements - DM Modal
const dmModal = document.getElementById('dm-modal');
const dmForm = document.getElementById('dm-form');
const targetIdInput = document.getElementById('target-id-input');
const btnCloseDmModal = document.getElementById('btn-close-dm-modal');
const toast = document.getElementById('toast');

// --- LOCAL STORAGE HELPERS ---

function getRegisteredUsers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_USERS_KEY)) || {};
    } catch {
        return {};
    }
}

function saveRegisteredUsers(users) {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
}

function getSavedUserSession() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_CURRENT_USER)) || null;
    } catch {
        return null;
    }
}

function saveUserSession(user) {
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(user));
}

function clearUserSession() {
    localStorage.removeItem(STORAGE_CURRENT_USER);
}

// User-specific storage key for Friends & Messages
function getUserDataKey(userId) {
    return `ELITE_DATA_${userId}`;
}

function getUserPrivateData() {
    if (!loggedUser) return { friends: {}, messages: {} };
    try {
        const raw = localStorage.getItem(getUserDataKey(loggedUser.userId));
        return raw ? JSON.parse(raw) : { friends: {}, messages: {} };
    } catch {
        return { friends: {}, messages: {} };
    }
}

function saveUserPrivateData(data) {
    if (!loggedUser) return;
    localStorage.setItem(getUserDataKey(loggedUser.userId), JSON.stringify(data));
}

function generateUserId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ELITE-${code}`;
}

// --- AUTH LOGIC ---

tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    hideAuthError();
});

tabRegisterBtn.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    hideAuthError();
});

function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

function hideAuthError() {
    authError.classList.add('hidden');
}

// Register Handle
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const nick = regUsernameInput.value.trim();
    const pass = regPasswordInput.value.trim();

    if (!nick || !pass) {
        showAuthError('Wypełnij wszystkie pola.');
        return;
    }

    const users = getRegisteredUsers();
    // Check if username already exists
    const existingUser = Object.values(users).find(u => u.username.toLowerCase() === nick.toLowerCase());
    if (existingUser) {
        showAuthError('Użytkownik o tym nicku już istnieje.');
        return;
    }

    const userId = generateUserId();
    const newUser = { username: nick, userId, password: pass };

    users[userId] = newUser;
    saveRegisteredUsers(users);

    loginUserSession(newUser);
});

// Login Handle
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const nick = loginUsernameInput.value.trim();
    const pass = loginPasswordInput.value.trim();

    const users = getRegisteredUsers();
    const user = Object.values(users).find(u => u.username.toLowerCase() === nick.toLowerCase());

    if (!user || user.password !== pass) {
        showAuthError('Nieprawidłowy nick lub hasło.');
        return;
    }

    loginUserSession(user);
});

function loginUserSession(user) {
    loggedUser = user;
    saveUserSession(user);
    loginModal.classList.add('hidden');

    myUsernameEl.textContent = user.username;
    myUseridEl.textContent = `ID: ${user.userId}`;
    myAvatar.textContent = user.username.charAt(0).toUpperCase();

    // Connect to socket with login data
    socket.emit('login_user', { userId: user.userId, username: user.username });

    // Load saved friends/conversations list
    updateDmListUI();
    btnChannelMain.click();
}

logoutBtn.addEventListener('click', () => {
    clearUserSession();
    location.reload();
});

// Copy User ID on click
myUseridEl.addEventListener('click', () => {
    if (loggedUser && loggedUser.userId) {
        navigator.clipboard.writeText(loggedUser.userId);
        showToast('Twój ID został skopiowany do schowka!');
    }
});

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}

// --- MOBILE SIDEBAR TOGGLE ---
mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
});

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
}

closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// --- CHANNEL & DM SWITCHING ---

btnChannelMain.addEventListener('click', () => {
    activeChat = { type: 'global', id: 'GŁÓWNY', name: 'GŁÓWNY' };
    btnChannelMain.classList.add('active');
    document.querySelectorAll('.dm-btn').forEach(btn => btn.classList.remove('active'));
    
    chatTypeIcon.textContent = '#';
    chatTitleName.textContent = 'GŁÓWNY';
    chatTitleDesc.textContent = 'Oficjalny główny kanał tekstowy';
    bannerTitle.textContent = 'Witaj na kanale #GŁÓWNY!';
    bannerSub.textContent = 'To jest początek kanału #GŁÓWNY serwera ELITE.';
    messageInput.placeholder = 'Napisz wiadomość na #GŁÓWNY...';
    
    renderMessages();
    closeSidebar();
});

// Open DM Modal
btnAddDm.addEventListener('click', () => {
    dmModal.classList.remove('hidden');
    targetIdInput.value = '';
    targetIdInput.focus();
});

btnCloseDmModal.addEventListener('click', () => {
    dmModal.classList.add('hidden');
});

dmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const targetId = targetIdInput.value.trim().toUpperCase();
    if (!targetId) return;

    if (loggedUser && targetId === loggedUser.userId) {
        alert('Nie możesz otworzyć prywatnego czatu sam ze sobą.');
        return;
    }

    addFriendAndOpen(targetId);
    dmModal.classList.add('hidden');
});

function addFriendAndOpen(targetUserId) {
    const data = getUserPrivateData();
    if (!data.friends[targetUserId]) {
        data.friends[targetUserId] = { name: targetUserId };
        if (!data.messages[targetUserId]) {
            data.messages[targetUserId] = [];
        }
        saveUserPrivateData(data);
    }
    updateDmListUI();
    switchToDm(targetUserId);
}

function switchToDm(targetUserId) {
    const data = getUserPrivateData();
    const friend = data.friends[targetUserId] || { name: targetUserId };

    activeChat = { type: 'private', id: targetUserId, name: friend.name };

    btnChannelMain.classList.remove('active');
    document.querySelectorAll('.dm-btn').forEach(btn => {
        if (btn.dataset.userid === targetUserId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    chatTypeIcon.textContent = '@';
    chatTitleName.textContent = friend.name;
    chatTitleDesc.textContent = `Rozmowa prywatna | ID: ${targetUserId}`;
    bannerTitle.textContent = `Rozmowa z ${friend.name}`;
    bannerSub.textContent = `Początek prywatnej rozmowy z użytkownikiem ${targetUserId}. Wszystko zapisuje się w Twojej przeglądarce!`;
    messageInput.placeholder = `Napisz do ${friend.name}...`;

    renderMessages();
    closeSidebar();
}

function updateDmListUI() {
    dmList.innerHTML = '';
    const data = getUserPrivateData();

    Object.keys(data.friends).forEach(targetUserId => {
        const friend = data.friends[targetUserId];
        const btn = document.createElement('button');
        btn.className = 'dm-btn' + (activeChat.type === 'private' && activeChat.id === targetUserId ? ' active' : '');
        btn.dataset.userid = targetUserId;
        btn.innerHTML = `<span class="hashtag">@</span> ${friend.name}`;
        btn.addEventListener('click', () => switchToDm(targetUserId));
        dmList.appendChild(btn);
    });
}

// --- MESSAGES HANDLING & LOCALSTORAGE PERSISTENCE ---

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !loggedUser) return;

    if (activeChat.type === 'global') {
        socket.emit('send_global_message', { text });
    } else if (activeChat.type === 'private') {
        socket.emit('send_private_message', {
            targetUserId: activeChat.id,
            text: text
        });
    }

    messageInput.value = '';
});

// Receive Global Message
socket.on('system_message', (data) => {
    globalMessages.push({ isSystem: true, text: data.text, timestamp: data.timestamp });
    if (activeChat.type === 'global') {
        renderMessages();
    }
});

socket.on('new_global_message', (data) => {
    globalMessages.push(data);
    if (activeChat.type === 'global') {
        renderMessages();
    }
});

// Receive Private Message
socket.on('new_private_message', (data) => {
    if (!loggedUser) return;

    const partnerId = (data.senderId === loggedUser.userId) ? data.targetUserId : data.senderId;
    const partnerName = (data.senderId === loggedUser.userId) ? data.targetUserId : data.senderName;

    // Save message into LocalStorage
    const pData = getUserPrivateData();
    if (!pData.friends[partnerId]) {
        pData.friends[partnerId] = { name: partnerName };
    } else if (data.senderId !== loggedUser.userId && partnerName && partnerName !== partnerId) {
        // Update friendly name if known
        pData.friends[partnerId].name = partnerName;
    }

    if (!pData.messages[partnerId]) {
        pData.messages[partnerId] = [];
    }

    pData.messages[partnerId].push(data);
    saveUserPrivateData(pData);
    updateDmListUI();

    if (activeChat.type === 'private' && activeChat.id === partnerId) {
        renderMessages();
    }
});

// Render UI Messages
function renderMessages() {
    const bannerHtml = `
        <div class="welcome-banner">
            <h1 id="banner-title">${bannerTitle.textContent}</h1>
            <p id="banner-sub">${bannerSub.textContent}</p>
        </div>
    `;
    messagesContainer.innerHTML = bannerHtml;

    let msgsToRender = [];

    if (activeChat.type === 'global') {
        msgsToRender = globalMessages;
    } else if (activeChat.type === 'private') {
        const pData = getUserPrivateData();
        msgsToRender = pData.messages[activeChat.id] || [];
    }

    msgsToRender.forEach(msg => {
        if (msg.isSystem) {
            const sysDiv = document.createElement('div');
            sysDiv.className = 'system-msg';
            sysDiv.textContent = `[${msg.timestamp}] ${msg.text}`;
            messagesContainer.appendChild(sysDiv);
        } else {
            const item = document.createElement('div');
            item.className = 'msg-item';
            item.innerHTML = `
                <div class="avatar">${(msg.senderName || 'U').charAt(0).toUpperCase()}</div>
                <div class="msg-body">
                    <div class="msg-header">
                        <span class="msg-author">${escapeHtml(msg.senderName)}</span>
                        <span class="msg-author-id">(${msg.senderId})</span>
                        <span class="msg-time">${msg.timestamp}</span>
                    </div>
                    <div class="msg-content">${escapeHtml(msg.text)}</div>
                </div>
            `;
            messagesContainer.appendChild(item);
        }
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

// AUTO INIT USER SESSION IF SAVED IN LOCALSTORAGE
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = getSavedUserSession();
    if (savedUser) {
        loginUserSession(savedUser);
    }
});
