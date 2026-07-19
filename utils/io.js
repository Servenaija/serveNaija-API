/**
 * io.js — Singleton holder for the Socket.io Server instance.
 *
 * Usage:
 *   // In www.js (startup):
 *   require('./utils/io').setIo(io);
 *
 *   // Anywhere else:
 *   const { getIo } = require('./utils/io');
 *   getIo()?.to('user_123').emit('notification', payload);
 */

let _io = null;

function setIo(io) {
  _io = io;
}

function getIo() {
  return _io;
}

module.exports = { setIo, getIo };
