/**
 * Socket.io configuration for ServeNaija real-time features:
 *  - Chat (customer <-> provider, admin <-> customer, admin <-> provider)
 *  - Incoming call signals (incoming_call, call_accepted, call_rejected, call_ended)
 *  - Provider online status / typing indicators
 *
 * Each connected user joins a personal room: `user_<userId>`
 * Conversation rooms: `conv_<conversationId>`
 */

const { verify } = require('jsonwebtoken');
const config = require('./auth');

// userId -> socketId
const onlineUsers = new Map();

function getSocketId(userId) {
  return onlineUsers.get(userId);
}

function isOnline(userId) {
  return onlineUsers.has(userId);
}

/**
 * Attach Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
function configureSocket(io) {
  // Validate JWT on connection (optional — allows anonymous)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next();

    verify(token, config.jwt.secret, (err, decoded) => {
      if (!err && decoded?.sub?.id) {
        socket.userId = decoded.sub.id;
        socket.actorType = decoded.sub.actor;
      }
      next();
    });
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;

    if (userId) {
      onlineUsers.set(userId, socket.id);
      socket.join(`user_${userId}`);
      // Notify others that this user is now online
      socket.broadcast.emit('user_online', { userId });
    }

    // Join a chat conversation room
    socket.on('join_conversation', (conversationId) => {
      if (conversationId) socket.join(`conv_${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      if (conversationId) socket.leave(`conv_${conversationId}`);
    });

    // Typing indicator
    socket.on('typing', ({ conversationId, isTyping }) => {
      if (conversationId && userId) {
        socket.to(`conv_${conversationId}`).emit('user_typing', { userId, conversationId, isTyping });
      }
    });

    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(userId);
        // Notify others that this user went offline
        socket.broadcast.emit('user_offline', { userId });
      }
    });
  });

  return io;
}

module.exports = { configureSocket, getSocketId, isOnline };
