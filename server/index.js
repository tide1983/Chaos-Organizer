const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const serve = require('koa-static');
const mount = require('koa-mount');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = new Koa();
const router = new Router();

const messages = [];
let pinnedMessage = null;
const favorites = new Set();
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(koaBody({ 
  multipart: true,
  formidable: {
    uploadDir: UPLOADS_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024,
    filename: (name, ext, part) => `${uuidv4()}${ext}`
  }
}));

app.use(serve(path.join(__dirname, '../dist')));
app.use(mount('/uploads', serve(UPLOADS_DIR)));

// --- HTTP API ---
router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from Koa server!' };
});

router.get('/api/messages', (ctx) => {
  const limit = parseInt(ctx.query.limit) || 10;
  const offset = parseInt(ctx.query.offset) || 0;
  const total = messages.length;
  const start = Math.max(0, total - offset - limit);
  const end = total - offset;
  const chunk = messages.slice(start, end);
  
  const chunkWithFav = chunk.map(msg => ({
    ...msg,
    isFavorite: favorites.has(msg.id)
  }));

  ctx.body = {
    messages: chunkWithFav,
    total: total,
    hasMore: start > 0
  };
});

router.get('/api/search', (ctx) => {
  const query = ctx.query.q;
  if (!query) {
    ctx.body = [];
    return;
  }
  const results = messages.filter(msg => 
    msg.text && msg.text.toLowerCase().includes(query.toLowerCase())
  ).map(msg => ({
    ...msg,
    isFavorite: favorites.has(msg.id)
  }));
  ctx.body = results;
});

// Получить список вложений по категориям
router.get('/api/attachments', (ctx) => {
  const files = messages.filter(msg => msg.type === 'file');
  const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.fileName));
  const videos = files.filter(f => /\.(mp4|webm|mov|avi)$/i.test(f.fileName));
  const others = files.filter(f => !images.includes(f) && !videos.includes(f));
  
  ctx.body = { images, videos, others };
});

router.get('/api/pinned', (ctx) => {
  ctx.body = { pinned: pinnedMessage };
});

router.post('/api/pin', (ctx) => {
  const { id } = ctx.request.body;
  const msg = messages.find(m => m.id === id);
  if (!msg) {
    ctx.status = 404;
    ctx.body = { error: 'Сообщение не найдено' };
    return;
  }
  pinnedMessage = msg;
  broadcast(JSON.stringify({ type: 'pin_update', data: pinnedMessage }));
  ctx.body = { status: 'ok', pinned: pinnedMessage };
});

router.delete('/api/pin', (ctx) => {
  pinnedMessage = null;
  broadcast(JSON.stringify({ type: 'pin_update', data: null }));
  ctx.body = { status: 'ok' };
});

router.get('/api/favorites', (ctx) => {
  const favMessages = messages.filter(msg => favorites.has(msg.id))
    .map(msg => ({ ...msg, isFavorite: true }));
  ctx.body = favMessages;
});

router.post('/api/favorite', (ctx) => {
  const { id } = ctx.request.body;
  const msg = messages.find(m => m.id === id);
  if (!msg) {
    ctx.status = 404;
    ctx.body = { error: 'Сообщение не найдено' };
    return;
  }

  let isFav = false;
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
    isFav = true;
  }

  broadcast(JSON.stringify({ type: 'favorite_update', data: { id, isFavorite: isFav } }));
  ctx.body = { status: 'ok', isFavorite: isFav };
});

router.post('/api/messages', (ctx) => {
  const { text, clientId } = ctx.request.body;
  
  if (!text) {
    ctx.status = 400;
    ctx.body = { error: 'Текст обязателен' };
    return;
  }

  const userMessage = {
    id: Date.now(),
    text,
    timestamp: new Date().toISOString(),
    sender: 'user',
    clientId: clientId || null,
    type: 'text'
  };
  messages.push(userMessage);
  broadcast(JSON.stringify({ type: 'new_message', data: userMessage }));

  if (text.startsWith('@chaos:')) {
    const command = text.slice(7).trim().toLowerCase();
    let botResponse = '';

    switch (true) {
      case command.includes('погода'):
        const weathers = ['Солнечно, +25°C', 'Облачно, +18°C', 'Дождь, +12°C', 'Снег, -5°C'];
        botResponse = `Погода на сегодня: ${weathers[Math.floor(Math.random() * weathers.length)]}`;
        break;
      case command.includes('время'):
        botResponse = `Текущее время: ${new Date().toLocaleTimeString('ru-RU')}`;
        break;
      case command.includes('шутка'):
        const jokes = [
          'Почему программисты путают Хэллоуин и Рождество? Потому что Oct 31 == Dec 25.',
          'Программист — это человек, который решает проблему, о которой вы даже не знали, что она у вас есть.',
          'Сколько программистов нужно, чтобы поменять лампочку? Ни одного, это аппаратная проблема.'
        ];
        botResponse = jokes[Math.floor(Math.random() * jokes.length)];
        break;
      case command.includes('помощь'):
        botResponse = 'Доступные команды: @chaos: погода, @chaos: время, @chaos: шутка, @chaos: помощь, @chaos: курс';
        break;
      case command.includes('курс'):
        botResponse = 'Курс "Продвинутый JavaScript в браузере" посвящен созданию современных веб-приложений. Вы сейчас как раз делаете мессенджер — отличная практика!';
        break;
      default:
        botResponse = 'Я не знаю такой команды. Напишите @chaos: помощь, чтобы увидеть список.';
    }

    setTimeout(() => {
      const botMessage = {
        id: Date.now() + 1,
        text: botResponse,
        timestamp: new Date().toISOString(),
        sender: 'bot',
        clientId: 'bot',
        type: 'text'
      };
      messages.push(botMessage);
      broadcast(JSON.stringify({ type: 'new_message', data: botMessage }));
    }, 500);
  }

  ctx.body = { status: 'ok', message: userMessage };
});

router.post('/api/upload', (ctx) => {
  const file = ctx.request.files?.file;
  const clientId = ctx.request.body.clientId;

  if (!file) {
    ctx.status = 400;
    ctx.body = { error: 'Файл не загружен' };
    return;
  }

  const uploadedFile = Array.isArray(file) ? file[0] : file;
  const filename = path.basename(uploadedFile.filepath);
  
  const newMessage = {
    id: Date.now(),
    text: uploadedFile.originalFilename || 'Файл',
    timestamp: new Date().toISOString(),
    sender: 'user',
    clientId: clientId || null,
    type: 'file',
    fileUrl: `/uploads/${filename}`,
    fileName: uploadedFile.originalFilename,
    fileSize: uploadedFile.size
  };
  
  messages.push(newMessage);
  broadcast(JSON.stringify({ type: 'new_message', data: newMessage }));

  ctx.body = { status: 'ok', message: newMessage };
});

app.use(router.routes()).use(router.allowedMethods());

// --- WebSocket Server ---
const server = http.createServer(app.callback());
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Новый клиент подключен');
  ws.send(JSON.stringify({ type: 'pin_update', data: pinnedMessage }));
  ws.on('close', () => console.log('Клиент отключен'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});