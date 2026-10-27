const Joi = require('joi');

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid id');

const cancelBody = Joi.object({
  reason: Joi.string().allow('').max(500).default('Cancelled by admin'),
});

const releaseSingleBody = Joi.object({
  targetType: Joi.string().valid('provider_payout', 'booking', 'order').required(),
  targetId: objectId.required(),
  note: Joi.string().allow('').max(500).default(''),
});

const releaseBulkBody = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        targetType: Joi.string().valid('provider_payout', 'booking', 'order').required(),
        targetId: objectId.required(),
      })
    )
    .min(1)
    .max(200)
    .optional(),
  releaseAll: Joi.boolean().default(false),
  note: Joi.string().allow('').max(500).default(''),
}).or('items', 'releaseAll');

const broadcastBody = Joi.object({
  title: Joi.string().min(2).max(120).required(),
  body: Joi.string().min(2).max(1000).required(),
  type: Joi.string()
    .valid('booking', 'payment', 'kyc', 'chat', 'call', 'system', 'promotion', 'order', 'review', 'wallet', 'other')
    .default('system'),
  target: Joi.string().valid('all', 'providers', 'customers').default('all'),
});

const targetedBody = Joi.object({
  userId: objectId.required(),
  actorType: Joi.string().valid('customer', 'provider').required(),
  title: Joi.string().min(2).max(120).required(),
  body: Joi.string().min(2).max(1000).required(),
  type: Joi.string()
    .valid('booking', 'payment', 'kyc', 'chat', 'call', 'system', 'promotion', 'order', 'review', 'wallet', 'other')
    .default('system'),
  data: Joi.object().unknown(true).default({}),
});

const directMessageBody = Joi.object({
  targetUserId: objectId.required(),
  targetActorType: Joi.string().valid('customer', 'provider').required(),
  text: Joi.string().min(1).max(2000).required(),
  bookingId: Joi.string().allow(null, '').default(null),
});

// Agent payout validations
const agentPayoutSingleBody = Joi.object({
  agentId: Joi.string().required(),
  note: Joi.string().allow('').max(500).default(''),
});

const agentPayoutBulkBody = Joi.object({
  items: Joi.array()
    .items(Joi.string().required())
    .min(1)
    .max(500)
    .optional(),
  releaseAll: Joi.boolean().default(false),
  note: Joi.string().allow('').max(500).default(''),
}).or('items', 'releaseAll');

module.exports = {
  cancelBody,
  releaseSingleBody,
  releaseBulkBody,
  broadcastBody,
  targetedBody,
  directMessageBody,
  agentPayoutSingleBody,
  agentPayoutBulkBody,
};
