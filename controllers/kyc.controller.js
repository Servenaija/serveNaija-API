const catchAsync = require('../utils/catchAsync');
const Provider = require('../models/provider');
const { sendPushNotification } = require('../services/notification.service');

const dojahWebhook = catchAsync(async (req, res) => {
  console.log('[Dojah Webhook] Received:', JSON.stringify(req.body, null, 2));

  const { status, verification_status, data } = req.body;

  // Only require ID card verification
  const idVerified = data?.id?.status === true;

  if (!idVerified) {
    console.log('[Dojah Webhook] ID verification failed or missing');
    return res.json({ received: true });
  }

  console.log('[Dojah Webhook] ID verified, verification_status:', verification_status);

  // Extract user info
  const firstName = data?.id?.id_data?.first_name || '';
  const lastName = data?.id?.id_data?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  const rawEmail =
    data?.user_data?.data?.email ||
    data?.email?.data?.email ||
    req.body.email;

  let userEmail = null;

  if (rawEmail) {
    try {
      userEmail = decodeURIComponent(rawEmail).trim().toLowerCase();
    } catch (err) {
      userEmail = String(rawEmail).trim().toLowerCase();
    }
  }

  let provider = null;
  let newStatus = '';
  let notificationTitle = '';
  let notificationBody = '';

  // Determine status based on webhook response
  if (verification_status === 'Completed' && status === true) {
    newStatus = 'approved';
    notificationTitle = 'KYC Verification Approved';
    notificationBody = 'Your KYC verification has been successfully completed. You can now enjoy all provider features.';
  } else if (verification_status === 'Pending') {
    newStatus = 'pending';
    // Don't send notification for pending
  } else {
    newStatus = 'failed';
    notificationTitle = 'KYC Verification Failed';
    notificationBody = 'Your KYC verification could not be completed. Please contact support for assistance.';
  }

  // Find and update provider
  if (userEmail) {
    provider = await Provider.findOneAndUpdate(
      { email: userEmail.toLowerCase() },
      { kycStatus: newStatus },
      { new: true }
    );
    console.log('[Dojah Webhook] Provider updated by email:', userEmail);
  } else if (fullName) {
    provider = await Provider.findOneAndUpdate(
      { fullName: { $regex: new RegExp(fullName, 'i') } },
      { kycStatus: newStatus },
      { new: true }
    );
    console.log('[Dojah Webhook] Provider updated by name:', fullName);
  } else {
    console.log('[Dojah Webhook] No email or name found');
    return res.json({ received: true });
  }

  // Send notification only for approved or failed (not pending)
  if (provider && provider.expoPushToken && newStatus !== 'pending') {
    try {
      await sendPushNotification({
        userId: provider._id.toString(),
        actorType: 'provider',
        title: notificationTitle,
        body: notificationBody,
        type: 'kyc',
        data: {
          status: newStatus,
          referenceId: req.body.reference_id || '',
        },
      });
      console.log(`[Dojah Webhook] Notification sent: ${notificationTitle} to ${userEmail}`);
    } catch (notificationError) {
      console.error('[Dojah Webhook] Failed to send notification:', notificationError);
    }
  }

  res.json({ received: true });
});

module.exports = { dojahWebhook };