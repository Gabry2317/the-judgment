const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { SERVER } = require('./src/config');
const { createLobbyManager } = require('./src/lobbyManager');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: SERVER.allowedOrigin === '*' ? true : SERVER.allowedOrigin.split(',') }));
app.use(express.json());

// Healthcheck utile per Kitab e per verificare rapidamente che il server
// sia raggiungibile (anche da router/UPnP debug).
app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'the-judgement-server', time: new Date().toISOString() });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: SERVER.allowedOrigin === '*' ? true : SERVER.allowedOrigin.split(','),
    methods: ['GET', 'POST'],
  },
});

const lobbyManager = createLobbyManager(io);

io.on('connection', (socket) => {
  lobbyManager.attach(socket);
});

httpServer.listen(SERVER.port, () => {
  console.log(`[The Judgement] server in ascolto sulla porta ${SERVER.port}`);
  if (!SERVER.groqApiKey) {
    console.warn('[The Judgement] ATTENZIONE: GROQ_API_KEY non impostata, il giudice AI userà un verdetto di fallback.');
  }
});
