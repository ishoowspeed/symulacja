const socket = io();

// Elementy DOM
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const displayUsername = document.getElementById('display-username');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');

const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

const notificationBadge = document.getElementById('notification-badge');
const unreadCountElem = document.getElementById('unread-count');

const editModal = document.getElementById('edit-modal');
const editInput = document.getElementById('edit-input');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const saveEditBtn = document.getElementById('save-edit-btn');

// Stan aplikacji
let currentUser = null;
let unreadCount = 0;
let currentEditingId = null;
let isWindowFocused = true;

// Sprawdzanie ostrości okna dla nieprzeczytanych wiadomości
window.addEventListener('focus', () => {
  isWindowFocused = true;
  resetUnreadCount();
});

window.addEventListener('blur', () => {
  isWindowFocused = false;
});

// Logowanie
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  if (username) {
    currentUser = username;
    displayUsername.textContent = currentUser;
    userAvatar.textContent = currentUser.charAt(0).toUpperCase();

    // Ukryj login, pokaż czat
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    // WŁĄCZENIE WIDOCZNOŚCI CZERWONEGO KÓŁKA PO ZALOGOWANIU
    notificationBadge.classList.remove('hidden');
    updateBadgeUI();

    socket.emit('user-login', currentUser);
  }
});

// Wylogowanie
logoutBtn.addEventListener('submit', logout);
logoutBtn.addEventListener('click', logout);

function logout() {
  currentUser = null;
  // Ukryj czat, pokaż login
  chatScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');

  // WYŁĄCZENIE (UKRYCIE) CZERWONEGO KÓŁKA GDY NIE JESTEŚ ZALOGOWANY
  notificationBadge.classList.add('hidden');
  resetUnreadCount();
  usernameInput.value = '';
}

// Inicjalizacja wiadomości
socket.on('init-messages', (messages) => {
  messagesContainer.innerHTML = '';
  messages.forEach(msg => renderMessage(msg));
  scrollToBottom();
});

// Wysyłanie nowej wiadomości
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (text && currentUser) {
    socket.emit('send-message', {
      author: currentUser,
      text: text
    });
    messageInput.value = '';
  }
});

// Odbieranie nowej wiadomości
socket.on('new-message', (msg) => {
  renderMessage(msg);
  scrollToBottom();

  // Aktualizuj powiadomienia, jeśli użytkownik nie jest skupiony na karcie lub wiadomość przyszła od kogoś innego
  if (!isWindowFocused && msg.author !== currentUser) {
    unreadCount++;
    updateBadgeUI();
  }
});

// Edytowanie wiadomości - nasłuchiwanie z serwera
socket.on('message-edited', (data) => {
  const { id, newText, edited } = data;
  const msgElem = document.getElementById(`msg-${id}`);
  if (msgElem) {
    const textElem = msgElem.querySelector('.message-text-content');
    if (textElem) {
      textElem.textContent = newText;
    }
    let editedTag = msgElem.querySelector('.edited-tag');
    if (edited && !editedTag) {
      const tag = document.createElement('span');
      tag.className = 'edited-tag';
      tag.textContent = '(ZEDYTOWANE)';
      msgElem.querySelector('.message-text').appendChild(tag);
    }
  }
});

// Usuwanie wiadomości - nasłuchiwanie z serwera
socket.on('message-deleted', (data) => {
  const { id } = data;
  const msgElem = document.getElementById(`msg-${id}`);
  if (msgElem) {
    msgElem.remove();
  }
});

// Renderowanie pojedynczej wiadomości
function renderMessage(msg) {
  const isSelf = msg.author === currentUser;
  const div = document.createElement('div');
  div.id = `msg-${msg.id}`;
  div.className = `message-item ${isSelf ? 'sent' : 'received'}`;

  let html = `
    <div class="message-meta">
      <span class="message-author">${escapeHtml(msg.author)}</span>
      <span class="message-time">${msg.timestamp}</span>
    </div>
    <div class="message-text">
      <span class="message-text-content">${escapeHtml(msg.text)}</span>
      ${msg.edited ? '<span class="edited-tag">(ZEDYTOWANE)</span>' : ''}
    </div>
  `;

  if (isSelf) {
    html += `
      <div class="message-actions">
        <button class="action-btn edit-btn" onclick="openEditModal('${msg.id}')" title="Edytuj">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="action-btn delete-btn" onclick="deleteMessage('${msg.id}')" title="Usuń">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  }

  div.innerHTML = html;
  messagesContainer.appendChild(div);
}

// Otwieranie modalu edycji
window.openEditModal = function(id) {
  const msgElem = document.getElementById(`msg-${id}`);
  if (!msgElem) return;

  const currentText = msgElem.querySelector('.message-text-content').textContent;
  currentEditingId = id;
  editInput.value = currentText;
  editModal.classList.remove('hidden');
  editInput.focus();
};

cancelEditBtn.addEventListener('click', () => {
  editModal.classList.add('hidden');
  currentEditingId = null;
});

saveEditBtn.addEventListener('click', () => {
  const newText = editInput.value.trim();
  if (newText && currentEditingId && currentUser) {
    socket.emit('edit-message', {
      id: currentEditingId,
      newText: newText,
      username: currentUser
    });
    editModal.classList.add('hidden');
    currentEditingId = null;
  }
});

// Usuwanie wiadomości
window.deleteMessage = function(id) {
  if (confirm('Czy na pewno chcesz usunąć tę wiadomość?')) {
    socket.emit('delete-message', {
      id: id,
      username: currentUser
    });
  }
};

// Pomocnicze funkcje powiadomień
notificationBadge.addEventListener('click', () => {
  resetUnreadCount();
});

function updateBadgeUI() {
  // Pokaż powiadomienie tylko gdy licznik > 0 oraz użytkownik JEST ZALOGOWANY
  if (unreadCount > 0 && currentUser) {
    unreadCountElem.textContent = unreadCount > 99 ? '99+' : unreadCount;
    unreadCountElem.style.display = 'inline-block';
  } else {
    unreadCountElem.style.display = 'none';
  }
}

function resetUnreadCount() {
  unreadCount = 0;
  updateBadgeUI();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
