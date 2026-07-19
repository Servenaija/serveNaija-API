const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const chatController = require('../../controllers/chat.controller');
const { uploadSingle } = require('../../middlewares/upload');

const router = express.Router();
router.use(allowedMethod);

// Conversations
router.route('/conversations')
  .get(verifyToken, chatController.listConversations)
  .post(verifyToken, chatController.createOrGetConversation)
  .all(unAllowedMethod);

router.route('/conversations/:id')
  .get(verifyToken, chatController.getConversation)
  .delete(verifyToken, chatController.deleteConversation)
  .all(unAllowedMethod);

// Messages
router.route('/conversations/:id/messages')
  .get(verifyToken, chatController.listMessages)
  .post(verifyToken, chatController.sendMessage)
  .all(unAllowedMethod);

// Image message — multipart upload
router.route('/conversations/:id/messages/image')
  .post(verifyToken, uploadSingle, chatController.sendImageMessage)
  .all(unAllowedMethod);

// Inbound webhook for external chat events
// Secured by X-Webhook-Secret header
router.route('/webhook')
  .post(chatController.chatWebhook)
  .all(unAllowedMethod);

// Admin cleanup (can also be called by cron)
router.route('/cleanup')
  .post(verifyToken, chatController.cleanupResolvedConversations)
  .all(unAllowedMethod);

module.exports = router;
