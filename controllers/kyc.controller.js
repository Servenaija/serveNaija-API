const catchAsync = require('../utils/catchAsync');
const Provider = require('../models/provider');
const { sendPushNotification } = require('../services/notification.service');

const dojahWebhook = catchAsync(async (req, res) => {
  console.log('[Dojah Webhook] Received:', JSON.stringify(req.body, null, 2));

  const { status, verification_status, data } = req.body;

  // Only require ID card verification – selfie is not needed
  const idVerified = data?.id?.status === true;

  if (!idVerified) {
    console.log('[Dojah Webhook] ID verification failed or missing');
    return res.json({ received: true });
  }

  console.log('[Dojah Webhook] ID verified, verification_status:', verification_status);

  // Extract user info from the ID data
  const firstName = data?.id?.id_data?.first_name || '';
  const lastName = data?.id?.id_data?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Extract email – from the correct location
  const userEmail =
    data?.user_data?.data?.email ||
    data?.email?.data?.email ||
    req.body.email;

  let provider = null;

  if (userEmail) {
    provider = await Provider.findOneAndUpdate(
      { email: userEmail.toLowerCase() },
      { 
        kycVerified: true,
        $set: {
          'kycData.documentType': data?.id?.id_data?.document_type || '',
          'kycData.documentNumber': data?.id?.id_data?.document_number || '',
          'kycData.verifiedAt': new Date(),
          'kycData.dojahReference': req.body.reference_id || '',
          'kycData.verificationStatus': verification_status,
        }
      },
      { new: true }
    );
    console.log('[Dojah Webhook] Provider verified by email:', userEmail);
  } else if (fullName) {
    provider = await Provider.findOneAndUpdate(
      { fullName: { $regex: new RegExp(fullName, 'i') } },
      { 
        kycVerified: true,
        $set: {
          'kycData.documentType': data?.id?.id_data?.document_type || '',
          'kycData.documentNumber': data?.id?.id_data?.document_number || '',
          'kycData.verifiedAt': new Date(),
          'kycData.dojahReference': req.body.reference_id || '',
          'kycData.verificationStatus': verification_status,
        }
      },
      { new: true }
    );
    console.log('[Dojah Webhook] Provider verified by name:', fullName);
  } else {
    console.log('[Dojah Webhook] No email or name found to update provider');
    return res.json({ received: true });
  }

  // Send push notification based on verification status
  if (provider) {
    const userId = provider._id.toString();
    const actorType = 'provider';
    const notificationData = {
      referenceId: req.body.reference_id || '',
      documentType: data?.id?.id_data?.document_type || '',
    };

    if (verification_status === 'Completed' && status === true) {
      // Successful verification
      await sendPushNotification({
        userId,
        actorType,
        title: 'KYC Verification Approved ✅',
        body: `Your KYC verification has been successfully completed. You can now enjoy all provider features.`,
        type: 'kyc',
        data: { ...notificationData, status: 'success' },
      });
      console.log('[Dojah Webhook] Success notification sent to:', userEmail);
    } else if (verification_status === 'Pending') {
      // Pending verification
      await sendPushNotification({
        userId,
        actorType,
        title: 'KYC Verification Pending ⏳',
        body: `Your KYC verification is pending review. We'll notify you once it's completed.`,
        type: 'kyc',
        data: { ...notificationData, status: 'pending' },
      });
      console.log('[Dojah Webhook] Pending notification sent to:', userEmail);
    } else {
      // Failed verification (any other status)
      await sendPushNotification({
        userId,
        actorType,
        title: 'KYC Verification Failed ❌',
        body: `Your KYC verification could not be completed. Please contact support for assistance.`,
        type: 'kyc',
        data: { ...notificationData, status: 'failed' },
      });
      console.log('[Dojah Webhook] Failed notification sent to:', userEmail);
    }
  }

  res.json({ received: true });
});

module.exports = { dojahWebhook };