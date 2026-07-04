const { tokenTypes } = require('../config/tokens');
const mongoose = require("mongoose")
const Schema = mongoose.Schema

const Tokens = new Schema({
        token: {
          type: String,
          required: true,
          trim: true,
          index: true,
        },
        user: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          required: true,
          enum: [tokenTypes.REFRESH, tokenTypes.RESET_PASSWORD, tokenTypes.VERIFY_EMAIL, tokenTypes.ACCESS],
        },
        expires : {
          type: Date,
          required: true,
        },
       
}, { timestamps: true })

// Auto-remove expired tokens — MongoDB TTL index
Tokens.index({ expires: 1 }, { expireAfterSeconds: 0 });

// Fast lookup by user and type
Tokens.index({ user: 1, type: 1 });

// module.exports = Tokens
module.exports = mongoose.model('Token', Tokens);

