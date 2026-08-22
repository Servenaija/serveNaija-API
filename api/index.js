const http = require('http');
const app = require('../app');
const { Server } = require('socket.io');
const { configureSocket } = require('../config/socket');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS',
      'PATCH',
    ],
    credentials: true,
  },

  transports: [
    'websocket',
    'polling',
  ],

  path: '/socket.io/',
});

configureSocket(io);

app.set('io', io);

module.exports = server;