module.exports.checkRole = (...allowedRoles) => {
    return (req, res, next) => {
      const role = req.user.role;
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          status: false,
          message: 'Access denied. This action is restricted to specific roles.'
        });
      }
      next();
    };
  };
  
  exports.isProvider = (req, res, next) => {
    if (req.user.role !== 'provider') {
      return res.status(403).json({
        status: false,
        message: 'Access restricted to providers only'
      });
    }
    next();
  };
  
  exports.isCustomer = (req, res, next) => {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        status: false,
        message: 'Access restricted to customers only'
      });
    }
    next();
  };