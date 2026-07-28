const crypto = require('crypto');
require('dotenv').config();
const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_ACCOUNTS_PER_IP = 2;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const accountSchema = new mongoose.Schema({
  publicId: { type: String, unique: true, required: true },
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  createdIp: { type: String, required: true }
}, { timestamps: true });
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, unique: true, required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});
const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  text: { type: String, required: true, maxlength: MAX_MESSAGE_LENGTH }
}, { timestamps: true });
const Account = mongoose.model('Account', accountSchema);
const Session = mongoose.model('Session', sessionSchema);
const Message = mongoose.model('Message', messageSchema);

const cleanUsername = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const accountView = (account) => ({ id: account.publicId, username: account.username });
const clientIp = (request) => request.ip || request.socket.remoteAddress || 'unknown';

function createPublicId() {
  return crypto.randomBytes(5).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

async function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ tokenHash: hashToken(token), accountId, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) });
  return token;
}

async function getAccountFromToken(token) {
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session) return null;
  return Account.findById(session.accountId);
}

async function authentication(request, response, next) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  const account = await getAccountFromToken(token);
  if (!account) return response.status(401).json({ error: 'Sesja wygasła. Zaloguj się ponownie.' });
  request.account = account;
  next();
}

app.post('/api/register', async (request, response) => {
  const username = cleanUsername(request.body.username);
  const password = request.body.password;
  const ip = clientIp(request);
  if (username.length < 3 || username.length > 24) return response.status(400).json({ error: 'Nazwa musi mieć od 3 do 24 znaków.' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) return response.status(400).json({ error: 'Hasło musi mieć od 6 do 72 znaków.' });
  if (await Account.countDocuments({ createdIp: ip }) >= MAX_ACCOUNTS_PER_IP) return response.status(429).json({ error: 'Z tego połączenia utworzono już maksymalnie 2 konta.' });
  if (await Account.exists({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) return response.status(409).json({ error: 'Ta nazwa jest już zajęta.' });
  let publicId = createPublicId();
  while (await Account.exists({ publicId })) publicId = createPublicId();
  const account = await Account.create({ publicId, username, passwordHash: await bcrypt.hash(password, 12), createdIp: ip });
  const token = await createSession(account._id);
  response.status(201).json({ token, account: accountView(account) });
});

app.post('/api/login', async (request, response) => {
  const username = cleanUsername(request.body.username);
  const account = await Account.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!account || !(await bcrypt.compare(request.body.password || '', account.passwordHash))) return response.status(401).json({ error: 'Nieprawidłowa nazwa lub hasło.' });
  const token = await createSession(account._id);
  response.json({ token, account: accountView(account) });
});

app.get('/api/me', authentication, (request, response) => response.json({ account: accountView(request.account) }));
app.put('/api/me', authentication, async (request, response) => {
  const username = cleanUsername(request.body.username);
  const { currentPassword, newPassword } = request.body;
  if (username.length < 3 || username.length > 24) return response.status(400).json({ error: 'Nazwa musi mieć od 3 do 24 znaków.' });
  if (!(await bcrypt.compare(currentPassword || '', request.account.passwordHash))) return response.status(401).json({ error: 'Podaj obecne hasło.' });
  const other = await Account.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), _id: { $ne: request.account._id } });
  if (other) return response.status(409).json({ error: 'Ta nazwa jest już zajęta.' });
  request.account.username = username;
  if (newPassword) { if (newPassword.length < 6 || newPassword.length > 72) return response.status(400).json({ error: 'Nowe hasło musi mieć od 6 do 72 znaków.' }); request.account.passwordHash = await bcrypt.hash(newPassword, 12); }
  await request.account.save();
  response.json({ account: accountView(request.account) });
});

app.get('/api/users/:publicId', authentication, async (request, response) => {
  const account = await Account.findOne({ publicId: request.params.publicId.toUpperCase() });
  if (!account || account._id.equals(request.account._id)) return response.status(404).json({ error: 'Nie znaleziono użytkownika o takim ID.' });
  response.json({ account: accountView(account) });
});

app.get('/api/conversations', authentication, async (request, response) => {
  const messages = await Message.find({ $or: [{ senderId: request.account._id }, { recipientId: request.account._id }] }).sort({ createdAt: -1 }).populate('senderId recipientId');
  const conversations = new Map();
  for (const message of messages) {
    const other = message.senderId._id.equals(request.account._id) ? message.recipientId : message.senderId;
    if (!conversations.has(other.publicId)) conversations.set(other.publicId, { account: accountView(other), lastText: message.text, time: message.createdAt });
  }
  response.json({ conversations: [...conversations.values()] });
});

app.get('/api/conversations/:publicId/messages', authentication, async (request, response) => {
  const other = await Account.findOne({ publicId: request.params.publicId.toUpperCase() });
  if (!other || other._id.equals(request.account._id)) return response.status(404).json({ error: 'Nie znaleziono rozmowy.' });
  const messages = await Message.find({ $or: [{ senderId: request.account._id, recipientId: other._id }, { senderId: other._id, recipientId: request.account._id }] }).sort({ createdAt: 1 }).limit(200);
  response.json({ account: accountView(other), messages: messages.map((message) => ({ id: message._id, isOwn: message.senderId.equals(request.account._id), text: message.text, time: message.createdAt })) });
});

io.use(async (socket, next) => {
  const account = await getAccountFromToken(socket.handshake.auth?.token);
  if (!account) return next(new Error('Brak autoryzacji'));
  socket.data.account = account;
  next();
});
io.on('connection', (socket) => {
  const account = socket.data.account;
  socket.join(`user:${account._id}`);
  socket.on('direct message', async ({ recipientId, text }, reply) => {
    const content = typeof text === 'string' ? text.trim() : '';
    const recipient = await Account.findOne({ publicId: String(recipientId || '').toUpperCase() });
    if (!recipient || recipient._id.equals(account._id) || !content || content.length > MAX_MESSAGE_LENGTH) return reply?.({ error: 'Nie można wysłać wiadomości.' });
    const message = await Message.create({ senderId: account._id, recipientId: recipient._id, text: content });
    const payload = { id: message._id, senderId: account._id.toString(), recipientId: recipient._id.toString(), sender: accountView(account), recipient: accountView(recipient), text: message.text, time: message.createdAt };
    io.to(`user:${account._id}`).to(`user:${recipient._id}`).emit('direct message', payload);
    reply?.({ ok: true });
  });
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('Brakuje zmiennej MONGODB_URI. Dodaj adres bazy MongoDB Atlas w ustawieniach Render.');
  await mongoose.connect(process.env.MONGODB_URI);
  httpServer.listen(PORT, () => console.log(`ELITE działa na porcie ${PORT}`));
}
start().catch((error) => { console.error(error.message); process.exit(1); });
