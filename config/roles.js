const allRoles = {
    customer: ['viewProfile', 'updateProfile', 'createBooking', 'manageWallet'],
    provider: ['viewProfile', 'updateProfile', 'manageJobs', 'manageServices', 'manageWallet'],
    admin: [
      'manageCustomers', 'manageProviders', 'manageBookings',
      'manageKYC', 'manageTransactions', 'manageWallets',
      'sendNotifications', 'viewDashboard',
    ],
    superadmin: [
      'manageCustomers', 'manageProviders', 'manageBookings',
      'manageKYC', 'manageTransactions', 'manageWallets',
      'sendNotifications', 'viewDashboard', 'manageAdmins',
    ],
  };

  const roles = Object.keys(allRoles);
  const roleRights = new Map(Object.entries(allRoles));
  
  module.exports = {
    roles,
    roleRights,
  };
  