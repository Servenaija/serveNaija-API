const catchAsync = require('../utils/catchAsync');
const Provider = require('../models/provider');

const dojahWebhook = catchAsync(async (req, res) => {
  console.log('[Dojah Webhook] Received:', JSON.stringify(req.body).slice(0, 300));

  const { status, verification_status, data, reference_id, widget_id } = req.body;

  // Check if verification is successful
  const isVerified =
    status === true &&
    verification_status === 'Completed' &&
    data?.id?.status === true &&
    data?.selfie?.status === true;

  if (!isVerified) {
    console.log('[Dojah Webhook] Verification not successful');
    return res.json({ received: true });
  }

  // Extract user info from the ID data
  const firstName = data?.id?.id_data?.first_name || '';
  const lastName = data?.id?.id_data?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const documentType = data?.id?.id_data?.document_type || '';
  const documentNumber = data?.id?.id_data?.document_number || '';

  // Find provider by name or email (Dojah may pass user reference)
  // If you passed email during SDK launch, Dojah returns it in metadata
  const userEmail = req.body.metadata?.user_email || req.body.email;

  if (userEmail) {
    // Update provider by email
    const provider = await Provider.findOneAndUpdate(
      { email: userEmail.toLowerCase() },
      {
        kycVerified: true,
        $set: {
          'kycData.documentType': documentType,
          'kycData.documentNumber': documentNumber,
          'kycData.verifiedAt': new Date(),
          'kycData.dojahReference': reference_id,
        },
      },
      { new: true }
    );

    console.log('[Dojah Webhook] Provider verified:', provider?.email || 'not found');
  } else if (fullName) {
    // Fallback: find by name
    const provider = await Provider.findOneAndUpdate(
      {
        $or: [
          { fullName: { $regex: new RegExp(fullName, 'i') } },
          { firstName: { $regex: new RegExp(firstName, 'i') } },
        ],
      },
      {
        kycVerified: true,
        $set: {
          'kycData.documentType': documentType,
          'kycData.documentNumber': documentNumber,
          'kycData.verifiedAt': new Date(),
          'kycData.dojahReference': reference_id,
        },
      },
      { new: true }
    );

    console.log('[Dojah Webhook] Provider verified by name:', provider?.fullName || 'not found');
  }

  res.json({ received: true });
});

module.exports = { dojahWebhook };