// middlewares/trackVisitor.js
const Visitor = require("../models/visitor");

const trackVisitor = async (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user ? req.user._id : null; // if you use JWT auth or sessions

    // Save unique visit per IP or userId
    const existing = await Visitor.findOne({ $or: [{ ip }, { userId }] });

    if (!existing) {
      await Visitor.create({ ip, userId });
    }

    next();
  } catch (err) {
    console.error("Visitor tracking error:", err.message);
    next();
  }
};

module.exports = trackVisitor;
