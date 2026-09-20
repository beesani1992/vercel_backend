import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SAFEPAY_BASE_URL = process.env.SAFEPAY_BASE_URL || 'https://sandbox.api.getsafepay.com';
const SAFEPAY_API_KEY = process.env.SAFEPAY_API_KEY;

// Credit & Price mappings
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
 * Lazy Supabase client factory to prevent initialization crashes at module load time
 */
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) are missing.');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

/**
 * 1. Create Safepay Tracker
 */
export const createSafepayTracker = async (req, res) => {
  try {
    if (!SAFEPAY_API_KEY) {
      console.error('CRITICAL: SAFEPAY_API_KEY is not configured.');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Safepay API Key is missing.'
      });
    }

    const { packageId, amount: clientAmount } = req.body || {};
    const usdAmount = PACKAGE_PRICES[packageId] || clientAmount || 5;
    const amountInCents = Math.round(Number(usdAmount) * 100);

    const response = await axios.post(
      `${SAFEPAY_BASE_URL}/order/v1/init`,
      {
        client: SAFEPAY_API_KEY,
        amount: amountInCents,
        currency: 'USD',
        environment: 'sandbox'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    const trackerToken = response.data?.data?.token || response.data?.token;

    if (!trackerToken) {
      console.error('Safepay response missing token:', response.data);
      return res.status(500).json({
        success: false,
        message: 'Invalid response from Safepay.'
      });
    }

    return res.status(200).json({
      success: true,
      trackerToken
    });

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('Safepay init error:', errorDetails);

    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.status?.message || 'Failed to create payment tracker.',
      details: errorDetails
    });
  }
};

/**
 * 2. Verify Safepay Payment & Add Credits to Supabase
 */
export const verifySafepayPayment = async (req, res) => {
  const { trackerToken, packageId, userIdentifier } = req.body || {};

  if (!trackerToken || !packageId || !userIdentifier) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters: trackerToken, packageId, or userIdentifier.'
    });
  }

  try {
    const supabase = getSupabaseClient();

    // 1. Check transaction status directly with Safepay API
    const response = await axios.get(
      `${SAFEPAY_BASE_URL}/order/v1/tracker/${trackerToken}`,
      { timeout: 10000 }
    );
    const trackerData = response.data?.data;

    // 2. Validate payment state
    if (!trackerData || trackerData.state !== 'PAID') {
      return res.status(400).json({
        success: false,
        message: `Payment verification failed. Current status: ${trackerData ? trackerData.state : 'Unknown'}`
      });
    }

    // 3. Prevent Replay Attack: Check if trackerToken was already processed
    const { data: existingTx } = await supabase
      .from('payments')
      .select('id')
      .eq('tracker_token', trackerToken)
      .single();

    if (existingTx) {
      return res.status(400).json({
        success: false,
        message: 'This payment has already been verified and credited.'
      });
    }

    // 4. Calculate credits
    const addedCredits = PACKAGE_CREDITS[packageId] || 100;
    const isEmail = userIdentifier.includes('@');
    const queryColumn = isEmail ? 'email' : 'id';

    // 5. Fetch user record
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

    // 6. Update user credit balance
    const currentCredits = Number(userData.credits) || 0;
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

    // 7. Record processed transaction to block reuse
    await supabase
      .from('payments')
      .insert({
        tracker_token: trackerToken,
        user_id: userData.id,
        package_id: packageId,
        amount: trackerData.amount,
        status: 'PAID'
      });

    return res.status(200).json({
      success: true,
      message: `Payment successful! Added ${addedCredits} credits.`,
      addedCredits,
      newCreditBalance
    });

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('Safepay verification error:', errorDetails);

    return res.status(500).json({
      success: false,
      message: 'Error verifying transaction with Safepay.',
      details: errorDetails
    });
  }
};
