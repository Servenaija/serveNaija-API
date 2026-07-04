// // jobs/sendVendorNotifications.js
// const Vendor = require("../models/vendor");
// const sendPushNotification = require("../utils/notification");

// async function sendVendorNotificationsJob() {
//   try {
//     console.log(" Running vendor notification job...");

//     const vendors = await Vendor.find({ expoPushToken: { $ne: null } });

//     for (const vendor of vendors) {
//       const token = typeof vendor.expoPushToken === "object"
//         ? vendor.expoPushToken.data || vendor.expoPushToken.value
//         : vendor.expoPushToken;

//       if (!token) continue;

//       await sendPushNotification(
//         token,
//         "Reminder 🚀",
//         "wakee wakee, don't forget to update stock!",
//         { type: "NEW_JOB" }
//       );
//     }

//     console.log(" Job done!");
//   } catch (error) {
//     console.error(" Error sending notifications:", error);
//   }
// }

// module.exports = sendVendorNotificationsJob;
