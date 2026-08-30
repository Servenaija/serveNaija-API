const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// POST /contact - Submit a contact message
const submitContact = catchAsync(async (req, res) => {
  const { name, email, topic, message } = req.body;

  if (!name || !email || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Name, email and message are required');
  }

  if (!email.includes('@')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide a valid email address');
  }

  const contact = await dB.contacts.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    topic: topic?.trim() || 'General enquiry',
    message: message.trim(),
  });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Your message has been sent. We will get back to you shortly.',
    data: {
      id: contact._id,
      name: contact.name,
      email: contact.email,
      topic: contact.topic,
      createdAt: contact.createdAt,
    },
  });
});

// GET /contact - Get all contact messages (admin only)
const getContacts = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, isRead } = req.query;
  const query = {};
  if (isRead !== undefined) query.isRead = isRead === 'true';

  const safePage = Math.max(1, Number(page));
  const safeLimit = Math.min(100, Math.max(1, Number(limit)));

  const contacts = await dB.contacts
    .find(query)
    .sort({ createdAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit);

  const total = await dB.contacts.countDocuments(query);

  res.json({
    success: true,
    data: contacts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  });
});

// GET /contact/:id - Get a single contact message
const getContact = catchAsync(async (req, res) => {
  const contact = await dB.contacts.findById(req.params.id);
  if (!contact) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Contact message not found');
  }
  res.json({ success: true, data: contact });
});

// PUT /contact/:id - Mark as read/unread
const updateContactStatus = catchAsync(async (req, res) => {
  const { isRead } = req.body;
  const contact = await dB.contacts.findByIdAndUpdate(
    req.params.id,
    { isRead },
    { new: true },
  );
  if (!contact) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Contact message not found');
  }
  res.json({ success: true, data: contact });
});

// DELETE /contact/:id - Delete a contact message
const deleteContact = catchAsync(async (req, res) => {
  const contact = await dB.contacts.findByIdAndDelete(req.params.id);
  if (!contact) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Contact message not found');
  }
  res.json({ success: true, message: 'Contact message deleted' });
});

module.exports = {
  submitContact,
  getContacts,
  getContact,
  updateContactStatus,
  deleteContact,
};
