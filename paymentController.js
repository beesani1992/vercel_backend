import Safepay from "@sfpy/node-core";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// ENVIRONMENT
// ======================================================

const SAFEPAY_SECRET_KEY =
  process.env.SAFEPAY_SECRET_KEY;

const SAFEPAY_API_KEY =
  process.env.SAFEPAY_API_KEY;

const SAFEPAY_HOST =
  process.env.SAFEPAY_HOST ||
  "https://sandbox.api.getsafepay.com";

const SAFEPAY_ENVIRONMENT =
  process.env.SAFEPAY_ENVIRONMENT ||
  "sandbox";


// ======================================================
// PACKAGES
// ======================================================

const PACKAGES = {
  "100_credits": {
    credits: 100,
    price: 5,
    currency: "USD"
  },

  "500_credits": {
    credits: 500,
    price: 20,
    currency: "USD"
  },

  "1500_credits": {
    credits: 1500,
    price: 50,
    currency: "USD"
  }
};


// ======================================================
// SUPABASE
// ======================================================

const getSupabaseClient = () => {

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  return createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
};


// ======================================================
// SAFEPAY
// ======================================================

const getSafepayClient = () => {

  if (!SAFEPAY_SECRET_KEY) {
    throw new Error(
      "SAFEPAY_SECRET_KEY is missing"
    );
  }

  return new Safepay(
    SAFEPAY_SECRET_KEY,
    {
      authType: "secret",
      host: SAFEPAY_HOST
    }
  );
};


// ======================================================
// CREATE SAFEPAY TRACKER
// ======================================================

export const createSafepayTracker = async (
  req,
  res
) => {

  try {

    // --------------------------------------------------
    // Check configuration
    // --------------------------------------------------

    if (!SAFEPAY_API_KEY) {

      return res.status(500).json({
        success: false,
        message:
          "SAFEPAY_API_KEY is not configured."
      });

    }


    // --------------------------------------------------
    // Request
    // --------------------------------------------------

    const {
      packageId,
      userIdentifier
    } = req.body || {};


    if (!packageId) {

      return res.status(400).json({
        success: false,
        message:
          "packageId is required."
      });

    }


    // --------------------------------------------------
    // Validate package
    // --------------------------------------------------

    const selectedPackage =
      PACKAGES[packageId];


    if (!selectedPackage) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid packageId."
      });

    }


    const {
      credits,
      price,
      currency
    } = selectedPackage;


    // --------------------------------------------------
    // Generate internal order ID
    // --------------------------------------------------

    const orderId =
      `ORDER_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`;


    // --------------------------------------------------
    // Amount in lowest denomination
    //
    // $5  = 500
    // $20 = 2000
    // $50 = 5000
    // --------------------------------------------------

    const amount =
      Math.round(price * 100);


    console.log(
      "Creating Safepay tracker..."
    );

    console.log({
      orderId,
      packageId,
      credits,
      price,
      currency,
      amount
    });


    // --------------------------------------------------
    // Safepay client
    // --------------------------------------------------

    const safepay =
      getSafepayClient();


    // --------------------------------------------------
    // CREATE PAYMENT SESSION
    //
    // IMPORTANT:
    // Only order_id is sent inside metadata.
    // --------------------------------------------------

    const response =
      await safepay.payments.session.setup({

        merchant_api_key:
          SAFEPAY_API_KEY,

        intent:
          "CYBERSOURCE",

        mode:
          "payment",

        entry_mode:
          "raw",

        currency:
          currency,

        amount:
          amount,

        metadata: {

          order_id:
            orderId

        }

      });


    console.log(
      "Safepay response:",
      JSON.stringify(
        response,
        null,
        2
      )
    );


    // --------------------------------------------------
    // Get tracker
    // --------------------------------------------------

    const trackerToken =
      response?.data?.tracker?.token;


    if (!trackerToken) {

      console.error(
        "Safepay did not return tracker token:",
        response
      );

      return res.status(500).json({

        success: false,

        message:
          "Safepay did not return a tracker token."

      });

    }


    console.log(
      "Tracker:",
      trackerToken
    );


    // --------------------------------------------------
    // Save ALL application information in Supabase
    // --------------------------------------------------

    const supabase =
      getSupabaseClient();


    const {
      error: databaseError
    } =
      await supabase
        .from("payments")
        .insert({

          order_id:
            orderId,

          user_id:
            userIdentifier || null,

          package_id:
            packageId,

          credits:
            credits,

          amount:
            price,

          currency:
            currency,

          tracker_token:
            trackerToken,

          status:
            "PENDING"

        });


    if (databaseError) {

      console.error(
        "Supabase payment insert error:",
        databaseError
      );

      return res.status(500).json({

        success: false,

        message:
          "Safepay tracker created, but payment could not be saved."

      });

    }


    // --------------------------------------------------
    // Create passport token
    // --------------------------------------------------

    const passportResponse =
      await safepay.auth.passport.create();


    const tbt =
      passportResponse?.data;


    if (!tbt) {

      return res.status(500).json({

        success: false,

        message:
          "Safepay authentication token was not created."

      });

    }


    // --------------------------------------------------
    // Checkout URLs
    // --------------------------------------------------

    const frontendUrl =
      process.env.FRONTEND_URL ||
      "http://localhost:3000";


    const redirectUrl =
      `${frontendUrl}/payment/success`;


    const cancelUrl =
      `${frontendUrl}/payment/cancel`;


    // --------------------------------------------------
    // Create checkout URL
    // --------------------------------------------------

    const checkoutUrl =
      safepay.checkouts.payment.create({

        tracker:
          trackerToken,

        tbt:
          tbt,

        environment:
          SAFEPAY_ENVIRONMENT,

        source:
          "hosted",

        redirect_url:
          redirectUrl,

        cancel_url:
          cancelUrl

      });


    console.log(
      "Checkout URL:",
      checkoutUrl
    );


    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({

      success: true,

      orderId:
        orderId,

      trackerToken:
        trackerToken,

      checkoutUrl:
        checkoutUrl,

      packageId:
        packageId,

      credits:
        credits,

      amount:
        price,

      currency:
        currency

    });


  } catch (error) {

    console.error(
      "================================"
    );

    console.error(
      "SAFEPAY ERROR"
    );

    console.error(
      error?.response?.data ||
      error?.message ||
      error
    );

    console.error(
      "================================"
    );


    return res.status(500).json({

      success: false,

      message:
        error?.response?.data?.status?.message ||
        error?.message ||
        "Failed to create Safepay payment."

    });

  }

};
