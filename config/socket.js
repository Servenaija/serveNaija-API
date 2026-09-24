/**
 * Socket.io configuration for ServeNaija real-time features:
 *  - Chat (customer <-> provider, admin <-> customer, admin <-> provider)
 *  - Support Tickets (user <-> admin)
 *  - Incoming call signals (incoming_call, call_accepted, call_rejected, call_ended)
 *  - Provider online status / typing indicators
 *
 * Each connected user joins a personal room: `user_<userId>`
 * Conversation rooms: `conv_<conversationId>`
 * Ticket rooms: `ticket_<ticketId>`
 * Admin support room: `admin_support`
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
    if (!token) {
      socket.isAnonymous = true;
      return next();
    }

    verify(token, config.jwt.secret, (err, decoded) => {
      if (!err && decoded?.sub?.id) {
        socket.userId = decoded.sub.id;
        socket.actorType = decoded.sub.actor;
        // Check if user is admin (you may need to add isAdmin flag to token)
        socket.isAdmin = decoded.sub.actor === 'admin';
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

    // ─── Chat Events ──────────────────────────────────────────────────────
    // Join a chat conversation room
    socket.on('join_conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conv_${conversationId}`);
        console.log(`User ${userId} joined conversation ${conversationId}`);
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conv_${conversationId}`);
        console.log(`User ${userId} left conversation ${conversationId}`);
      }
    });

    // Presence query — initial online-status snapshot for a specific user.
    // `user_online` / `user_offline` only broadcast TRANSITIONS to sockets
    // that are connected at that moment, so clients request the current
    // state (via ack) when a screen opens or their socket reconnects.
    // Event name/payload match the client protocol: `{ userId }` → ack
    // `{ userId, isOnline }`. Payload is lenient: object or bare id string.
    const handleUserStatus = (payload, cb) => {
      if (typeof cb !== 'function') return;
      const id = String(typeof payload === 'string' ? payload : payload?.userId ?? '');
      cb({ userId: id, isOnline: Boolean(id) && isOnline(id) });
    };
    socket.on('check_user_status', handleUserStatus);

    // Typing indicator
    socket.on('typing', ({ conversationId, isTyping }) => {
      if (conversationId && userId) {
        socket.to(`conv_${conversationId}`).emit('user_typing', { 
          userId, 
          conversationId, 
          isTyping 
        });
      }
    });

    // ─── Support Ticket Events ────────────────────────────────────────────
    // Join a ticket room (for real-time updates on a specific ticket)
    socket.on('join_ticket', (ticketId) => {
      if (ticketId) {
        socket.join(`ticket_${ticketId}`);
        console.log(`User ${userId} joined ticket ${ticketId}`);
      }
    });

    socket.on('leave_ticket', (ticketId) => {
      if (ticketId) {
        socket.leave(`ticket_${ticketId}`);
        console.log(`User ${userId} left ticket ${ticketId}`);
      }
    });

    // Admin joins the support admin room to receive all ticket updates
    socket.on('join_admin_support', () => {
      if (socket.isAdmin) {
        socket.join('admin_support');
        console.log(`Admin ${userId} joined admin support room`);
      } else {
        console.log(`User ${userId} attempted to join admin support room (not admin)`);
      }
    });

    socket.on('leave_admin_support', () => {
      if (socket.isAdmin) {
        socket.leave('admin_support');
        console.log(`Admin ${userId} left admin support room`);
      }
    });

    // ─── Call Events ──────────────────────────────────────────────────────
    // Incoming call
    socket.on('incoming_call', ({ toUserId, callData }) => {
      const toSocketId = onlineUsers.get(toUserId);
      if (toSocketId) {
        io.to(toSocketId).emit('incoming_call', {
          fromUserId: userId,
          callData,
        });
      }
    });

    socket.on('call_accepted', ({ toUserId, callData }) => {
      const toSocketId = onlineUsers.get(toUserId);
      if (toSocketId) {
        io.to(toSocketId).emit('call_accepted', {
          fromUserId: userId,
          callData,
        });
      }
    });

    socket.on('call_rejected', ({ toUserId }) => {
      const toSocketId = onlineUsers.get(toUserId);
      if (toSocketId) {
        io.to(toSocketId).emit('call_rejected', { fromUserId: userId });
      }
    });

    socket.on('call_ended', ({ toUserId }) => {
      const toSocketId = onlineUsers.get(toUserId);
      if (toSocketId) {
        io.to(toSocketId).emit('call_ended', { fromUserId: userId });
      }
    });

    // ─── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(userId);
        // Notify others that this user went offline
        socket.broadcast.emit('user_offline', { userId });
        console.log(`User ${userId} disconnected`);
      }
    });
  });

  return io;
}

module.exports = { configureSocket, getSocketId, isOnline };