const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const chatController = require('../../controllers/chat.controller');
const { uploadSingle } = require('../../middlewares/upload');
const { teamPermission, logTeamActivity } = require('../../middlewares/team');

const router = express.Router();
router.use(allowedMethod);

// Conversations (team members need the 'chat' permission)
router.route('/conversations')
  .get(verifyToken, teamPermission('chat'), chatController.listConversations)
  .post(verifyToken, teamPermission('chat'), chatController.createOrGetConversation)
  .all(unAllowedMethod);

router.route('/conversations/:id')
  .get(verifyToken, teamPermission('chat'), chatController.getConversation)
  .delete(verifyToken, teamPermission('chat'), chatController.deleteConversation)
  .all(unAllowedMethod);

// Messages
router.route('/conversations/:id/messages')
  .get(verifyToken, teamPermission('chat'), chatController.listMessages)
  .post(verifyToken, teamPermission('chat'), logTeamActivity('chat.message', 'conversation'), chatController.sendMessage)
  .all(unAllowedMethod);

// Image message — multipart upload
router.route('/conversations/:id/messages/image')
  .post(verifyToken, teamPermission('chat'), logTeamActivity('chat.message', 'conversation'), uploadSingle, chatController.sendImageMessage)
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
