const debug = require('debug')('servenaija-api:server');
const http = require('http');
const { Server } = require('socket.io');
const app = require('../app');
const config = require('../config/auth');
const logger = require('../config/logger');
const { configureSocket } = require('../config/socket');
const { setIo } = require('../utils/io');

const normalizePort = (val) => {
  const port = parseInt(val, 10);

  if (Number.isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
};

const port = normalizePort(config.port || '3000');
app.set('port', port);

const server = http.createServer(app);

const onError = (error) => {
  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
};

const onListening = () => {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  debug(`Listening on ${bind}`);
};

const exitHandler = () => {
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);
process.on('SIGTERM', () => {
  if (server) {
    server.close();
  }
});

server.on('error', onError);
server.on('listening', onListening);

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://dashboard.servenaija.com',
      'https://servenaija.com',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Configure chat + call socket events
configureSocket(io);

// Register the io singleton so services can emit events without access to app
setIo(io);

// Expose io on app so controllers can emit events
app.set('io', io);

server.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

module.exports = { io };
