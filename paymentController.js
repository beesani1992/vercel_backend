import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client with Service Role Key (bypasses RLS for backend updates)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Safepay credentials and endpoint
const SAFEPAY_API_KEY = process.env.SAFEPAY_API_KEY || 'sec_sandbox_key_here';
const SAFEPAY_BASE_URL = 'https://sandbox.api.getsafepay.com'; // Use https://api.getsafepay.com for production

// Credit mappings per package ID
const PACKAGE_CREDITS = {
  '100_credits': 100,
  '500_credits': 500,
  '1500_credits': 1500
};

const PACKAGE_PRICES = {
  '100_credits': 5,    // $5 USD
  '500_credits': 20,   // $20 USD
  '1500_credits': 50   // $50 USD
};

/**
 * 1. Create Safepay Tracker
 */
export const createSafepayTracker = async (req, res) => {
  const { packageId, amount: clientAmount } = req.body;
  const usdAmount = PACKAGE_PRICES[packageId] || clientAmount || 5;

  try {
    const response = await axios.post(`${SAFEPAY_BASE_URL}/order/v1/init`, {
      client: SAFEPAY_API_KEY,
      amount: usdAmount * 100, // Amount in cents ($5.00 = 500)
      currency: 'USD',
      environment: 'sandbox'
    });

    const trackerToken = response.data?.data?.token;

    if (!trackerToken) {
      return res.status(500).json({ success: false, message: 'Invalid response from Safepay.' });
    }

    return res.json({ success: true, trackerToken });
  } catch (error) {
    console.error('Safepay init error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to create payment tracker.' });
  }
};

/**
 * 2. Verify Safepay Payment & Add Credits to Supabase
 */
export const verifySafepayPayment = async (req, res) => {
  const { trackerToken, packageId, userIdentifier } = req.body;
  // userIdentifier can be either user ID (UUID) or email

  if (!trackerToken || !packageId || !userIdentifier) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters: trackerToken, packageId, or userIdentifier.'
    });
  }

  try {
    // 1. Check transaction status directly with Safepay API
    const response = await axios.get(`${SAFEPAY_BASE_URL}/order/v1/tracker/${trackerToken}`);
    const trackerData = response.data?.data;

    // 2. Validate payment state
    if (trackerData && trackerData.state === 'PAID') {
      const addedCredits = PACKAGE_CREDITS[packageId] || 100;

      // 3. Determine if identifier is an email or ID (UUID)
      const isEmail = userIdentifier.includes('@');
      const queryColumn = isEmail ? 'email' : 'id';

      // 4. Fetch current user from Supabase
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('id, credits')
        .eq(queryColumn, userIdentifier)
        .single();

      if (fetchError || !userData) {
        console.error('Supabase user fetch error:', fetchError);
        return res.status(404).json({
          success: false,
          message: 'User not found in Supabase database.'
        });
      }

      // 5. Update user credits in Supabase
      const currentCredits = userData.credits || 0;
      const newCreditBalance = currentCredits + addedCredits;

      const { error: updateError } = await supabase
        .from('users')
        .update({ credits: newCreditBalance })
        .eq('id', userData.id);

      if (updateError) {
        console.error('Supabase credit update error:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Payment verified, but failed to update credits in database.'
        });
      }

      return res.json({
        success: true,
        message: `Payment successful! Added ${addedCredits} credits.`,
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
      message: 'Error verifying transaction with Safepay.'
    });
  }
};
