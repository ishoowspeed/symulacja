const socket = io();

// State
let loggedUser = null; // { userId, username, status, friends: [] }
let activeChat = { type: 'global', id: 'GŁÓWNY', name: 'GŁÓWNY' };
const globalMessages = [];
const localPrivateMessages = {}; // Local session memory only

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
const myStatusDot = document.getElementById('my-status-dot');
const myUsernameEl = document.getElementById('my-username');
const myUseridEl = document.getElementById('my-userid');
const logoutBtn = document.getElementById('logout-btn');

const statusToggleBtn = document.getElementById('status-toggle-btn');
const statusDropdown = document.getElementById('status-dropdown');

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

// --- AUTH LOGIC (Konta zapisywane w pamięci serwera) ---

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

// Rejestracja konta na serwerze
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const username = regUsernameInput.value.trim();
    const password = regPasswordInput.value.trim();

    socket.emit('register', { username, password }, (response) => {
        if (response.success) {
            loginUserSession(response.user);
        } else {
            showAuthError(response.message);
        }
    });
});

// Logowanie na serwerze
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    socket.emit('login', { username, password }, (response) => {
        if (response.success) {
            loginUserSession(response.user);
        } else {
            showAuthError(response.message);
        }
    });
});

function loginUserSession(user) {
    loggedUser = user;
    loginModal.classList.add('hidden');

    myUsernameEl.textContent = user.username;
    myUseridEl.textContent = `ID: ${user.userId}`;
    myAvatar.textContent = user.username.charAt(0).toUpperCase();

    updateUserStatusUI(user.status || 'AKTYWNY');
    loadAndRenderFriends();
    btnChannelMain.click();
}

logoutBtn.addEventListener('click', () => {
    location.reload();
});

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

// --- STATUSES MANAGEMENT ---

statusToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    statusDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
    statusDropdown.classList.add('hidden');
});

document.querySelectorAll('.status-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        const newStatus = btn.dataset.status;
        socket.emit('change_status', newStatus);
        updateUserStatusUI(newStatus);
        statusDropdown.classList.add('hidden');
    });
});

function updateUserStatusUI(status) {
    if (!loggedUser) return;
    loggedUser.status = status;
    
    myStatusDot.className = 'status-indicator';
    if (status === 'AKTYWNY') myStatusDot.classList.add('status-active');
    else if (status === 'NIE PRZESZKADZAC') myStatusDot.classList.add('status-dnd');
    else myStatusDot.classList.add('status-offline');
}

socket.on('user_status_changed', (data) => {
    // Odśwież listę znajomych jeśli status znajomego się zmienił
    if (loggedUser && loggedUser.friends.includes(data.userId)) {
        loadAndRenderFriends();
    }
});

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
    
    chatTypeIcon.textContent = 'tag';
    chatTitleName.textContent = 'GŁÓWNY';
    chatTitleDesc.textContent = 'Oficjalny główny kanał tekstowy';
    bannerTitle.textContent = 'Witaj na kanale #GŁÓWNY!';
    bannerSub.textContent = 'To jest początek kanału #GŁÓWNY serwera ELITE.';
    messageInput.placeholder = 'Napisz wiadomość na #GŁÓWNY...';
    
    renderMessages();
    closeSidebar();
});

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

    socket.emit('add_friend', targetId, (res) => {
        if (res.success) {
            loggedUser.friends = res.myFriends;
            loadAndRenderFriends();
            switchToDm(res.friend.userId, res.friend.username);
            dmModal.classList.add('hidden');
        } else {
            alert(res.message);
        }
    });
});

function loadAndRenderFriends() {
    if (!loggedUser || !loggedUser.friends) return;

    socket.emit('get_friends_details', loggedUser.friends, (friendsDetails) => {
        dmList.innerHTML = '';
        friendsDetails.forEach(friend => {
            const btn = document.createElement('button');
            btn.className = 'dm-btn' + (activeChat.type === 'private' && activeChat.id === friend.userId ? ' active' : '');
            btn.dataset.userid = friend.userId;

            let dotClass = 'dot-active';
            if (friend.status === 'NIE PRZESZKADZAC') dotClass = 'dot-dnd';
            else if (friend.status === 'NIEAKTYWNY') dotClass = 'dot-offline';

            btn.innerHTML = `
                <div class="friend-item-content">
                    <span class="status-dot ${dotClass}"></span>
                    <span class="friend-name">${escapeHtml(friend.username)}</span>
                </div>
            `;

            btn.addEventListener('click', () => switchToDm(friend.userId, friend.username));
            dmList.appendChild(btn);
        });
    });
}

function switchToDm(targetUserId, targetUsername) {
    activeChat = { type: 'private', id: targetUserId, name: targetUsername };

    btnChannelMain.classList.remove('active');
    document.querySelectorAll('.dm-btn').forEach(btn => {
        if (btn.dataset.userid === targetUserId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    chatTypeIcon.textContent = 'alternate_email';
    chatTitleName.textContent = targetUsername;
    chatTitleDesc.textContent = `Rozmowa prywatna | ID: ${targetUserId}`;
    bannerTitle.textContent = `Rozmowa z ${targetUsername}`;
    bannerSub.textContent = `Początek prywatnej rozmowy z użytkownikiem ${targetUsername}.`;
    messageInput.placeholder = `Napisz do ${targetUsername}...`;

    renderMessages();
    closeSidebar();
}

// --- MESSAGES HANDLING ---

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

socket.on('new_private_message', (data) => {
    if (!loggedUser) return;

    const partnerId = (data.senderId === loggedUser.userId) ? data.targetUserId : data.senderId;

    if (!localPrivateMessages[partnerId]) {
        localPrivateMessages[partnerId] = [];
    }

    localPrivateMessages[partnerId].push(data);

    if (activeChat.type === 'private' && activeChat.id === partnerId) {
        renderMessages();
    }
});

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
        msgsToRender = localPrivateMessages[activeChat.id] || [];
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
