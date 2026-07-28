const socket = io();
const form = document.querySelector('#message-form');
const input = document.querySelector('#message-input');
const messagesContainer = document.querySelector('#messages');
const emptyState = document.querySelector('#empty-state');
const characterCount = document.querySelector('#character-count');
const MAX_MESSAGE_LENGTH = 500;

function formatTime(isoTime) {
  return new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(isoTime));
}

function addMessage(message) {
  emptyState?.remove();

  const article = document.createElement('article');
  article.className = 'message';

  const text = document.createElement('p');
  text.className = 'message-text';
  // textContent zabezpiecza przed wstrzyknięciem kodu HTML przez wiadomość.
  text.textContent = message.text;

  const time = document.createElement('time');
  time.className = 'message-time';
  time.dateTime = message.time;
  time.textContent = formatTime(message.time);
  time.title = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(message.time));

  article.append(text, time);
  messagesContainer.append(article);
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

socket.on('chat history', (history) => {
  history.forEach(addMessage);
});

socket.on('new message', addMessage);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  socket.emit('send message', text);
  input.value = '';
  input.style.height = 'auto';
  characterCount.textContent = `0 / ${MAX_MESSAGE_LENGTH}`;
  input.focus();
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  characterCount.textContent = `${input.value.length} / ${MAX_MESSAGE_LENGTH}`;
});

// Enter wysyła wiadomość, a Shift + Enter dodaje nową linię.
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
