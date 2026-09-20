const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key to bypass RLS for server updates
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Safepay configuration
const SAFEPAY_BASE_URL = 'https://sandbox.api.getsafepay.com'; // Use https://api.getsafepay.com for production

// Credit mapping per package
const PACKAGE_CREDITS = {
  '100_credits': 100,
  '500_credits': 500,
  '1500_credits': 1500
};

/**
 * Verify Safepay Payment & Add Credits in Supabase
 */
const verifySafepayPayment = async (req, res) => {
  const { trackerToken, packageId, userIdentifier } = req.body; 
  // `userIdentifier` can be the authenticated User ID (UUID) or User Email

  if (!trackerToken || !packageId || !userIdentifier) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters: trackerToken, packageId, or userIdentifier.'
    });
  }

  try {
    // 1. Verify payment status with Safepay
    const response = await axios.get(`${SAFEPAY_BASE_URL}/order/v1/tracker/${trackerToken}`);
    const trackerData = response.data?.data;

    // 2. Check if payment state is PAID
    if (trackerData && trackerData.state === 'PAID') {
      const addedCredits = PACKAGE_CREDITS[packageId] || 100;

      // 3. Determine if identifier is an email or UUID and fetch existing credits from Supabase
      const isEmail = userIdentifier.includes('@');
      const queryColumn = isEmail ? 'email' : 'id';

      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('id, credits')
        .eq(queryColumn, userIdentifier)
        .single();

      if (fetchError || !userData) {
        console.error('Supabase fetch error:', fetchError);
        return res.status(404).json({
          success: false,
          message: 'User not found in Supabase database.'
        });
      }

      // 4. Increment the user credit balance
      const currentCredits = userData.credits || 0;
      const newCreditBalance = currentCredits + addedCredits;

      const { error: updateError } = await supabase
        .from('users')
        .update({ credits: newCreditBalance })
        .eq('id', userData.id);

      if (updateError) {
        console.error('Supabase update error:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Payment verified, but failed to update credits in Supabase.'
        });
      }

      // 5. Return success response
      return res.json({
        success: true,
        message: `Payment successful! Added ${addedCredits} credits to account.`,
        addedCredits,
        newCreditBalance
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Payment verification failed. Current status: ${trackerData ? trackerData.state : 'Unknown'}`
      });
    }
  } catch (error) {
    console.error('Safepay verification error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying transaction.'
    });
  }
};

module.exports = {
  verifySafepayPayment
};
