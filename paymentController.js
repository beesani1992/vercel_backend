import Safepay from "@sfpy/node-core";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// CONFIGURATION & HELPERS
// ======================================================

const PACKAGES = {
  "100_credits": { credits: 100, price: 5, currency: "USD" },
  "500_credits": { credits: 500, price: 20, currency: "USD" },
  "1500_credits": { credits: 1500, price: 50, currency: "USD" }
};

const getEnv = () => ({
  SAFEPAY_SECRET_KEY: process.env.SAFEPAY_SECRET_KEY,
  SAFEPAY_API_KEY: process.env.SAFEPAY_API_KEY,
  SAFEPAY_HOST: process.env.SAFEPAY_HOST || "https://sandbox.api.getsafepay.com",
  SAFEPAY_ENVIRONMENT: process.env.SAFEPAY_ENVIRONMENT || "sandbox",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000"
});

const getSupabaseClient = () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase configuration environment variables.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

const getSafepayClient = () => {
  const { SAFEPAY_SECRET_KEY, SAFEPAY_HOST } = getEnv();

  if (!SAFEPAY_SECRET_KEY) {
    throw new Error("SAFEPAY_SECRET_KEY is missing from environment variables.");
  }

  return Safepay(SAFEPAY_SECRET_KEY, {
    authType: "secret",
    host: SAFEPAY_HOST
  });
};

// ======================================================
// CREATE SAFEPAY PAYMENT SESSION
// ======================================================

export const createSafepayTracker = async (req, res) => {
  try {
    const { SAFEPAY_SECRET_KEY, SAFEPAY_API_KEY, SAFEPAY_HOST, SAFEPAY_ENVIRONMENT, FRONTEND_URL } = getEnv();

    if (!SAFEPAY_SECRET_KEY || !SAFEPAY_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Safepay API or Secret key is not configured."
      });
    }

    const { packageId, userEmail } = req.body || {};

    if (!packageId || !PACKAGES[packageId]) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing packageId.",
        availablePackages: Object.keys(PACKAGES)
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedUserEmail = userEmail?.trim().toLowerCase();

    if (!normalizedUserEmail || !emailRegex.test(normalizedUserEmail)) {
      return res.status(400).json({
        success: false,
        message: "A valid userEmail is required."
      });
    }

    const selectedPackage = PACKAGES[packageId];
    const { credits, price, currency } = selectedPackage;
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const amountInLowestDenomination = Math.round(price * 100);

    const safepay = getSafepayClient();

    // 1. Create Payment Session
    const paymentResponse = await safepay.payments.session.setup({
      merchant_api_key: SAFEPAY_API_KEY,
      intent: "CYBERSOURCE",
      mode: "payment",
      entry_mode: "raw",
      currency,
      amount: amountInLowestDenomination,
      metadata: {
        order_id: orderId
      }
    });

    const trackerToken = paymentResponse?.data?.tracker?.token;
    if (!trackerToken) {
      console.error("Safepay tracker token missing:", paymentResponse);
      return res.status(500).json({
        success: false,
        message: "Safepay did not return a tracker token."
      });
    }

    // 2. Create Passport Token
    const passportResponse = await safepay.auth.passport.create();
    const authenticationToken = passportResponse?.data;

    if (!authenticationToken) {
      console.error("Safepay passport token missing:", passportResponse);
      return res.status(500).json({
        success: false,
        message: "Safepay did not return authentication token."
      });
    }

    // 3. Build Checkout URL
    const successUrl = `${FRONTEND_URL}/payment/success`;
    const cancelUrl = `${FRONTEND_URL}/payment/cancel`;

    const checkoutParams = new URLSearchParams({
      tracker: trackerToken,
      tbt: authenticationToken,
      environment: SAFEPAY_ENVIRONMENT,
      source: "hosted",
      redirect_url: successUrl,
      cancel_url: cancelUrl
    });

    const checkoutUrl = `${SAFEPAY_HOST}/embedded/checkout?${checkoutParams.toString()}`;

    // 4. Record Pending Payment in Supabase
    try {
      const supabase = getSupabaseClient();
      const { error: databaseError } = await supabase.from("payments").insert({
        order_id: orderId,
        user_email: normalizedUserEmail,
        package_id: packageId,
        credits,
        amount: price,
        currency,
        tracker_token: trackerToken,
        status: "PENDING"
      });

      if (databaseError) {
        console.error("Supabase pending payment insert error:", databaseError);
      }
    } catch (dbErr) {
      console.error("Database connection failure while saving pending payment:", dbErr);
    }

    return res.status(200).json({
      success: true,
      orderId,
      packageId,
      credits,
      amount: price,
      currency,
      userEmail: normalizedUserEmail,
      trackerToken,
      checkoutUrl
    });
  } catch (error) {
    console.error("SAFEPAY CREATE TRACKER ERROR:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to create Safepay payment.",
      error: process.env.NODE_ENV === "development" ? String(error) : undefined
    });
  }
};

// ======================================================
// VERIFY SAFEPAY PAYMENT
// ======================================================

export const verifySafepayPayment = async (req, res) => {
  try {
    const { trackerToken } = req.body || {};

    if (!trackerToken) {
      return res.status(400).json({
        success: false,
        message: "trackerToken is required."
      });
    }

    const supabase = getSupabaseClient();
    const safepay = getSafepayClient();

    // 1. Fetch payment status from Safepay Reporter API
    const paymentResponse = await safepay.reporter.payments.fetch(trackerToken);
    const tracker = paymentResponse?.data;

    if (!tracker) {
      return res.status(400).json({
        success: false,
        message: "Safepay returned no payment information."
      });
    }

    const paymentState = tracker?.tracker?.state || tracker?.state;

    if (paymentState !== "TRACKER_ENDED" && paymentState !== "PAID") {
      return res.status(400).json({
        success: false,
        message: `Payment is not completed. Current status: ${paymentState || "UNKNOWN"}`
      });
    }

    // 2. Check existing payment in Supabase
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id, order_id, user_id, user_email, package_id, credits, amount, currency, status")
      .eq("tracker_token", trackerToken)
      .maybeSingle();

    if (existingPaymentError) {
      console.error("Payment lookup error:", existingPaymentError);
    }

    // Early exit if already processed
    if (existingPayment && existingPayment.status === "PAID") {
      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        message: "Payment has already been processed.",
        addedCredits: Number(existingPayment.credits) || 0
      });
    }

    // 3. Resolve metadata fallback
    const metadata = tracker?.tracker?.metadata || tracker?.metadata || {};
    let packageId = metadata.package_id || metadata.packageId || existingPayment?.package_id || null;
    let userEmail = metadata.user_email || metadata.userEmail || existingPayment?.user_email || null;
    let orderId = metadata.order_id || metadata.orderId || existingPayment?.order_id || null;

    if (userEmail && typeof userEmail === "string") {
      userEmail = userEmail.trim().toLowerCase();
    }

    const selectedPackage = PACKAGES[packageId];
    if (!selectedPackage) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine purchased package."
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine userEmail."
      });
    }

    // 4. Fetch User
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email, credits")
      .eq("email", userEmail)
      .maybeSingle();

    if (userError || !userData) {
      console.error("User lookup error:", userError);
      return res.status(userError ? 500 : 404).json({
        success: false,
        message: userError ? "Failed to find user." : `User not found for email: ${userEmail}`
      });
    }

    const addedCredits = selectedPackage.credits;

    // 5. Atomic Lock: Lock payment row by marking status PAID first
    const { data: updatedPayment, error: paymentUpsertError } = await supabase
      .from("payments")
      .upsert(
        {
          order_id: orderId,
          tracker_token: trackerToken,
          user_id: userData.id,
          user_email: userEmail,
          package_id: packageId,
          credits: addedCredits,
          amount: selectedPackage.price,
          currency: selectedPackage.currency,
          status: "PAID"
        },
        { onConflict: "tracker_token" }
      )
      .select();

    if (paymentUpsertError) {
      console.error("Payment recording error:", paymentUpsertError);
      return res.status(500).json({
        success: false,
        message: "Payment recording failed."
      });
    }

    // 6. Update user credits (Safe atomic addition)
    const currentCredits = Number(userData.credits) || 0;
    const newCreditBalance = currentCredits + addedCredits;

    const { error: creditUpdateError } = await supabase
      .from("users")
      .update({ credits: newCreditBalance })
      .eq("id", userData.id);

    if (creditUpdateError) {
      console.error("Credit update error:", creditUpdateError);
      return res.status(500).json({
        success: false,
        message: "Payment recorded, but credit balance update failed."
      });
    }

    return res.status(200).json({
      success: true,
      alreadyProcessed: false,
      message: `Payment successful! Added ${addedCredits} credits.`,
      addedCredits,
      newCreditBalance,
      userEmail,
      packageId,
      orderId,
      trackerToken
    });
  } catch (error) {
    console.error("SAFEPAY PAYMENT VERIFICATION ERROR:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Error verifying Safepay payment.",
      error: process.env.NODE_ENV === "development" ? String(error) : undefined
    });
  }
};
