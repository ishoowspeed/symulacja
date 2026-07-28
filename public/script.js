const socket = io();
const form = document.querySelector('#message-form');
const input = document.querySelector('#message-input');
const messagesContainer = document.querySelector('#messages');
const characterCount = document.querySelector('#character-count');
const nicknameScreen = document.querySelector('#nickname-screen');
const nicknameForm = document.querySelector('#nickname-form');
const nicknameInput = document.querySelector('#nickname-input');
const loader = document.querySelector('#loader');
const app = document.querySelector('#app');
const MAX_MESSAGE_LENGTH = 500;
let nickname = sessionStorage.getItem('elite-nickname') || '';
let clientId = localStorage.getItem('elite-client-id');
if (!clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem('elite-client-id', clientId);
}

function formatTime(isoTime) { return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoTime)); }

function addMessage(message) {
  document.querySelector('#empty-state')?.remove();
  const isOwn = message.clientId === clientId;
  const article = document.createElement('article');
  article.className = `message${isOwn ? ' own' : ''}`;
  const info = document.createElement('div');
  info.className = 'message-info';
  const name = document.createElement('strong');
  name.textContent = isOwn ? 'Ty' : (message.nickname || 'Gość');
  const time = document.createElement('time');
  time.dateTime = message.time;
  time.textContent = formatTime(message.time);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message.text;
  info.append(name, time);
  article.append(info, bubble);
  messagesContainer.append(article);
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

socket.on('chat history', (history) => history.forEach(addMessage));
socket.on('new message', addMessage);

function showChat() {
  loader?.remove();
  app.classList.remove('is-hidden');
  nicknameScreen.classList.add('is-hidden');
  input.focus();
}

window.setTimeout(() => {
  if (nickname) showChat();
  else { loader?.remove(); nicknameScreen.classList.remove('is-hidden'); nicknameInput.focus(); }
}, 900);

nicknameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = nicknameInput.value.trim().replace(/\s+/g, ' ');
  if (!value) return;
  nickname = value;
  sessionStorage.setItem('elite-nickname', nickname);
  showChat();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || !nickname) return;
  socket.emit('send message', { text, nickname, clientId });
  input.value = ''; input.style.height = 'auto'; characterCount.textContent = `0 / ${MAX_MESSAGE_LENGTH}`; input.focus();
});

input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; characterCount.textContent = `${input.value.length} / ${MAX_MESSAGE_LENGTH}`; });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
