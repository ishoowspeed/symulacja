const socket = io();

// State
let myProfile = { username: '', userId: '' };
let activeChat = { type: 'global', id: 'GŁÓWNY', name: 'GŁÓWNY' };
const privateChats = new Map(); // targetUserId -> { name: string, messages: [] }
const globalMessages = [];

// DOM Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');

const myAvatar = document.getElementById('my-avatar');
const myUsernameEl = document.getElementById('my-username');
const myUseridEl = document.getElementById('my-userid');

const btnChannelMain = document.getElementById('btn-channel-main');
const btnAddDm = document.getElementById('btn-add-dm');
const dmList = document.getElementById('dm-list');

const chatTypeIcon = document.getElementById('chat-type-icon');
const chatTitleName = document.getElementById('chat-title-name');
const chatTitleDesc = document.getElementById('chat-title-desc');
const messagesContainer = document.getElementById('messages-container');
const bannerTitle = document.getElementById('banner-title');
const bannerSub = document.getElementById('banner-sub');

const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

const dmModal = document.getElementById('dm-modal');
const dmForm = document.getElementById('dm-form');
const targetIdInput = document.getElementById('target-id-input');
const btnCloseDmModal = document.getElementById('btn-close-dm-modal');
const toast = document.getElementById('toast');

// 1. Handle Login
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = usernameInput.value.trim();
    if (nick) {
        socket.emit('join', nick);
        loginModal.classList.add('hidden');
    }
});

// Profile Init
socket.on('init_profile', (data) => {
    myProfile = data;
    myUsernameEl.textContent = data.username;
    myUseridEl.textContent = `ID: ${data.userId}`;
    myAvatar.textContent = data.username.charAt(0).toUpperCase();
});

// Copy User ID on click
myUseridEl.addEventListener('click', () => {
    if (myProfile.userId) {
        navigator.clipboard.writeText(myProfile.userId);
        showToast('Twój ID został skopiowany!');
    }
});

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}

// 2. Channel Switching
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

    if (targetId === myProfile.userId) {
        alert('Nie możesz otworzyć czatu sam ze sobą.');
        return;
    }

    startPrivateChat(targetId, targetId);
    dmModal.classList.add('hidden');
});

function startPrivateChat(targetUserId, displayName) {
    if (!privateChats.has(targetUserId)) {
        privateChats.set(targetUserId, {
            name: displayName,
            messages: []
        });
        updateDmListUI();
    }
    switchToDm(targetUserId);
}

function switchToDm(targetUserId) {
    const chat = privateChats.get(targetUserId);
    if (!chat) return;

    activeChat = { type: 'private', id: targetUserId, name: chat.name };

    btnChannelMain.classList.remove('active');
    document.querySelectorAll('.dm-btn').forEach(btn => {
        if (btn.dataset.userid === targetUserId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    chatTypeIcon.textContent = '@';
    chatTitleName.textContent = chat.name;
    chatTitleDesc.textContent = `Prywatna konwersacja z ID: ${targetUserId}`;
    bannerTitle.textContent = `Wiadomości prywatne z ${chat.name}`;
    bannerSub.textContent = `Początek prywatnej rozmowy z użytkownikiem ${targetUserId}.`;
    messageInput.placeholder = `Napisz do ${chat.name}...`;

    renderMessages();
}

function updateDmListUI() {
    dmList.innerHTML = '';
    privateChats.forEach((data, targetUserId) => {
        const btn = document.createElement('button');
        btn.className = 'dm-btn' + (activeChat.type === 'private' && activeChat.id === targetUserId ? ' active' : '');
        btn.dataset.userid = targetUserId;
        btn.innerHTML = `<span class="hashtag">@</span> ${data.name}`;
        btn.addEventListener('click', () => switchToDm(targetUserId));
        dmList.appendChild(btn);
    });
}

// 3. Sending Messages
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

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

// 4. Receiving Messages
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
    const partnerId = (data.senderId === myProfile.userId) ? data.targetUserId : data.senderId;
    const partnerName = (data.senderId === myProfile.userId) ? data.targetUserId : data.senderName;

    if (!privateChats.has(partnerId)) {
        privateChats.set(partnerId, { name: partnerName, messages: [] });
        updateDmListUI();
    }

    const chat = privateChats.get(partnerId);
    chat.name = partnerName; // Update name if senderName is available
    chat.messages.push(data);

    if (activeChat.type === 'private' && activeChat.id === partnerId) {
        renderMessages();
    }
});

socket.on('private_error', (data) => {
    alert(data.error);
});

// Render Messages UI
function renderMessages() {
    // Remove all old message elements except welcome banner
    const bannerHtml = `
        <div class="welcome-banner">
            <h1 id="banner-title">${bannerTitle.textContent}</h1>
            <p id="banner-sub">${bannerSub.textContent}</p>
        </div>
    `;
    messagesContainer.innerHTML = bannerHtml;

    const msgsToRender = (activeChat.type === 'global') 
        ? globalMessages 
        : (privateChats.get(activeChat.id)?.messages || []);

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
