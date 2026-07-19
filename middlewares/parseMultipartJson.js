module.exports = function parseMultipartJson(req, res, next) {
    try {
      if (req.body.location && typeof req.body.location === 'string') {
        req.body.location = JSON.parse(req.body.location);
      }
      next();
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON in location field' });
    }
  };
  