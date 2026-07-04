const fetch = require("node-fetch");

async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken?.startsWith("ExponentPushToken")) return;

  const message = {
    to: expoPushToken,
    sound: "default",
    title,
    body,
    data,
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

module.exports = sendPushNotification;
