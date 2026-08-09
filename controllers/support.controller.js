const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const SupportTicket = require('../models/SupportTicket');
// ─── USER ROUTES ──────────────────────────────────────────────────────────────

// Create a support ticket
const createTicket = catchAsync(async (req, res) => {
  const { subject, message } = req.body;

  if (!message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message is required');
  }

  const userId = req.user._id.toString();
  const userType = req.user.constructor.modelName === 'Provider' ? 'provider' : 'customer';
  const userName = req.user.fullName || req.user.firstName || 'User';
  const userEmail = req.user.email;

  // Check for existing open ticket
  const existingTicket = await SupportTicket.findOne({
    'user.userId': userId,
    status: { $in: ['open', 'in-progress'] },
  });

  if (existingTicket) {
    existingTicket.messages.push({
      senderId: userId,
      senderType: 'user',
      senderName: userName,
      text: message,
      createdAt: new Date(),
      readBy: [userId],
    });
    existingTicket.lastMessageAt = new Date();
    existingTicket.unreadCount += 1;
    await existingTicket.save();

    // Emit socket event to admin
    const io = req.app.get('io');
    if (io) {
      io.to('admin_support').emit('new_ticket_message', {
        ticketId: existingTicket._id.toString(),
        message: existingTicket.messages[existingTicket.messages.length - 1],
        status: existingTicket.status,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Message added to existing ticket',
      data: { ticket: existingTicket },
    });
  }

  // Create new ticket
  const ticket = await SupportTicket.create({
    user: {
      userId,
      userType,
      name: userName,
      email: userEmail,
    },
    subject: subject || 'Support Request',
    messages: [
      {
        senderId: userId,
        senderType: 'user',
        senderName: userName,
        text: message,
        createdAt: new Date(),
        readBy: [userId],
      },
    ],
    status: 'open',
    lastMessageAt: new Date(),
    unreadCount: 1,
  });

  // Emit socket event to admin
  const io = req.app.get('io');
  if (io) {
    io.to('admin_support').emit('new_ticket', {
      ticketId: ticket._id.toString(),
      user: ticket.user,
      subject: ticket.subject,
      createdAt: ticket.createdAt,
    });
  }

  // Notify admins
  notificationService.sendPushNotification({
    userId: 'admin',
    actorType: 'admin',
    title: 'New Support Ticket',
    body: `${userName}: ${message.substring(0, 50)}...`,
    type: 'support',
    data: { ticketId: ticket._id.toString() },
  }).catch(() => {});

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Support ticket created',
    data: { ticket },
  });
});

// Get user's tickets
const getUserTickets = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();

  try {
    const tickets = await SupportTicket
      .find({ 'user.userId': userId })
      .sort({ lastMessageAt: -1 })
      .select('_id subject status lastMessageAt unreadCount messages')
      .lean();

    res.json({
      success: true,
      data: tickets || [],
    });
  } catch (error) {
    // If collection doesn't exist, Mongoose will create it when we first save
    // But for now, return empty array
    if (error.name === 'MongoServerError' && error.code === 26) {
      return res.json({
        success: true,
        data: [],
      });
    }
    // Log other errors
    console.error('Error fetching tickets:', error);
    res.json({
      success: true,
      data: [],
    });
  }
});

// Get a single ticket
const getUserTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.user._id.toString();

  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    'user.userId': userId,
  });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  // Mark messages as read
  ticket.messages.forEach(msg => {
    if (!msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
    }
  });
  ticket.unreadCount = 0;
  await ticket.save();

  res.json({
    success: true,
    data: ticket,
  });
});

// User adds message to ticket
const addUserMessage = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const userId = req.user._id.toString();
  const userName = req.user.fullName || req.user.firstName || 'User';

  if (!message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message is required');
  }

  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    'user.userId': userId,
  });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  if (ticket.status === 'closed' || ticket.status === 'resolved') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This ticket is closed');
  }

  ticket.messages.push({
    senderId: userId,
    senderType: 'user',
    senderName: userName,
    text: message,
    createdAt: new Date(),
    readBy: [userId],
  });
  ticket.lastMessageAt = new Date();
  ticket.unreadCount += 1;
  ticket.status = 'open';
  await ticket.save();

  // Emit socket event to admin
  const io = req.app.get('io');
  if (io) {
    io.to('admin_support').emit('new_ticket_message', {
      ticketId: ticket._id.toString(),
      message: ticket.messages[ticket.messages.length - 1],
      status: ticket.status,
    });
  }

  res.json({
    success: true,
    message: 'Message sent',
    data: { ticket },
  });
});

// User closes ticket
const closeTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.user._id.toString();

  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    'user.userId': userId,
  });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  ticket.status = 'closed';
  await ticket.save();

  const io = req.app.get('io');
  if (io) {
    io.to('admin_support').emit('ticket_closed', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    });
  }

  res.json({
    success: true,
    message: 'Ticket closed',
    data: { ticket },
  });
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// Get all tickets (admin only)
const getAdminTickets = catchAsync(async (req, res) => {
  const { status, limit = 50, page = 0 } = req.query;

  const query = {};
  if (status) query.status = status;

  const tickets = await SupportTicket
    .find(query)
    .sort({ lastMessageAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await SupportTicket.countDocuments(query);

  res.json({
    success: true,
    data: tickets,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// Get single ticket (admin only)
const getAdminTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const adminId = req.user._id.toString();

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  // Mark all messages as read for admin
  ticket.messages.forEach(msg => {
    if (!msg.readBy.includes(adminId)) {
      msg.readBy.push(adminId);
    }
  });
  ticket.unreadCount = 0;
  await ticket.save();

  res.json({
    success: true,
    data: ticket,
  });
});

// Assign ticket to admin
const assignTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const adminId = req.user._id.toString();
  const adminName = req.user.fullName || 'Admin';

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  ticket.assignedTo = adminId;
  ticket.status = 'in-progress';
  await ticket.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`ticket_${ticketId}`).emit('ticket_assigned', {
      ticketId: ticket._id.toString(),
      assignedTo: adminId,
      assignedToName: adminName,
      status: ticket.status,
    });
    io.to('admin_support').emit('ticket_updated', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
      assignedTo: adminId,
      assignedToName: adminName,
    });
  }

  res.json({
    success: true,
    message: 'Ticket assigned to you',
    data: { ticket },
  });
});

// Admin sends message
const sendAdminMessage = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const adminId = req.user._id.toString();
  const adminName = req.user.fullName || 'Admin';

  if (!message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message is required');
  }

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  if (ticket.status === 'closed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This ticket is closed');
  }

  ticket.messages.push({
    senderId: adminId,
    senderType: 'admin',
    senderName: adminName,
    text: message,
    createdAt: new Date(),
    readBy: [adminId],
  });
  ticket.lastMessageAt = new Date();
  ticket.unreadCount += 1;

  if (!ticket.assignedTo) {
    ticket.assignedTo = adminId;
    ticket.status = 'in-progress';
  }

  await ticket.save();

  // Emit socket event to user
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${ticket.user.userId}`).emit('new_support_message', {
      ticketId: ticket._id.toString(),
      message: ticket.messages[ticket.messages.length - 1],
      status: ticket.status,
    });
    io.to('admin_support').emit('new_ticket_message', {
      ticketId: ticket._id.toString(),
      message: ticket.messages[ticket.messages.length - 1],
      status: ticket.status,
    });
  }

  res.json({
    success: true,
    message: 'Message sent',
    data: { ticket },
  });
});

// Resolve ticket
const resolveTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  ticket.status = 'resolved';
  await ticket.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${ticket.user.userId}`).emit('ticket_resolved', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    });
    io.to('admin_support').emit('ticket_updated', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    });
  }

  res.json({
    success: true,
    message: 'Ticket resolved',
    data: { ticket },
  });
});

// Admin closes ticket
const adminCloseTicket = catchAsync(async (req, res) => {
  const { ticketId } = req.params;

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ticket not found');
  }

  ticket.status = 'closed';
  await ticket.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${ticket.user.userId}`).emit('ticket_closed', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    });
    io.to('admin_support').emit('ticket_updated', {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    });
  }

  res.json({
    success: true,
    message: 'Ticket closed',
    data: { ticket },
  });
});

module.exports = {
  createTicket,
  getUserTickets,
  getUserTicket,
  addUserMessage,
  closeTicket,
  getAdminTickets,
  getAdminTicket,
  assignTicket,
  sendAdminMessage,
  resolveTicket,
  adminCloseTicket,
};