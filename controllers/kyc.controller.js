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

  // Find provider by email
  const userEmail = req.body.metadata?.user_email || req.body.email;

  if (userEmail) {
    await Provider.findOneAndUpdate(
      { email: userEmail.toLowerCase() },
      { kycVerified: true },
      { new: true }
    );
  } else if (fullName) {
    await Provider.findOneAndUpdate(
      { fullName: { $regex: new RegExp(fullName, 'i') } },
      { kycVerified: true },
      { new: true }
    );
  }

  res.json({ received: true });
});

module.exports = { dojahWebhook };