const express = require('express');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const contactController = require('../../controllers/contact.controller');

const router = express.Router();
router.use(allowedMethod);

// Public: Submit a contact message
router.route('/')
  .post(contactController.submitContact)
  .all(unAllowedMethod);

// Admin: Get all contact messages
router.route('/messages')
  .get(contactController.getContacts)
  .all(unAllowedMethod);

// Admin: Get, update, delete a single contact message
router.route('/:id')
  .get(contactController.getContact)
  .put(contactController.updateContactStatus)
  .delete(contactController.deleteContact)
  .all(unAllowedMethod);

module.exports = router;
