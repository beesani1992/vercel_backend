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
// PACKAGE CONFIGURATION
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
    throw new Error(
      "SUPABASE_URL is missing."
    );
  }

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
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
// SAFEPAY CLIENT
// ======================================================

const getSafepayClient = () => {

  if (!SAFEPAY_SECRET_KEY) {
    throw new Error(
      "SAFEPAY_SECRET_KEY is missing."
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
// CREATE SAFEPAY PAYMENT SESSION
// ======================================================

export const createSafepayTracker = async (
  req,
  res
) => {

  try {

    // --------------------------------------------------
    // Validate Safepay configuration
    // --------------------------------------------------

    if (!SAFEPAY_SECRET_KEY) {

      return res.status(500).json({
        success: false,
        message:
          "SAFEPAY_SECRET_KEY is not configured."
      });

    }

    if (!SAFEPAY_API_KEY) {

      return res.status(500).json({
        success: false,
        message:
          "SAFEPAY_API_KEY is not configured."
      });

    }


    // --------------------------------------------------
    // Request body
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
          "Invalid packageId.",
        availablePackages:
          Object.keys(PACKAGES)
      });

    }


    const {
      credits,
      price,
      currency
    } = selectedPackage;


    // --------------------------------------------------
    // Generate order ID
    // --------------------------------------------------

    const orderId =
      `ORDER_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`;


    // --------------------------------------------------
    // Convert USD to lowest denomination
    //
    // $5  = 500
    // $20 = 2000
    // $50 = 5000
    // --------------------------------------------------

    const amountInLowestDenomination =
      Math.round(price * 100);


    console.log(
      "======================================"
    );

    console.log(
      "Creating Safepay Payment Session"
    );

    console.log(
      "Package:",
      packageId
    );

    console.log(
      "Credits:",
      credits
    );

    console.log(
      "Price:",
      price,
      currency
    );

    console.log(
      "Amount:",
      amountInLowestDenomination
    );

    console.log(
      "Order ID:",
      orderId
    );

    console.log(
      "======================================"
    );


    // --------------------------------------------------
    // Safepay client
    // --------------------------------------------------

    const safepay =
      getSafepayClient();


    // --------------------------------------------------
    // CREATE PAYMENT SESSION
    //
    // Current Safepay SDK method:
    //
    // safepay.payments.session.setup()
    // --------------------------------------------------

    const paymentResponse =
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
          amountInLowestDenomination,

        metadata: {

          order_id:
            orderId,

        }

      });


    console.log(
      "Safepay payment response:",
      JSON.stringify(
        paymentResponse,
        null,
        2
      )
    );


    // --------------------------------------------------
    // Extract tracker token
    // --------------------------------------------------

    const trackerToken =
      paymentResponse?.data?.tracker?.token;


    if (!trackerToken) {

      console.error(
        "Safepay tracker token missing:",
        paymentResponse
      );

      return res.status(500).json({

        success: false,

        message:
          "Safepay did not return a tracker token."

      });

    }


    console.log(
      "Tracker Token:",
      trackerToken
    );


    // --------------------------------------------------
    // CREATE PASSPORT TOKEN
    // --------------------------------------------------

    const passportResponse =
      await safepay.auth.passport.create();


    console.log(
      "Passport response received."
    );


    const authenticationToken =
      passportResponse?.data;


    if (!authenticationToken) {

      console.error(
        "Safepay passport response:",
        passportResponse
      );

      return res.status(500).json({

        success: false,

        message:
          "Safepay did not return authentication token."

      });

    }


    // --------------------------------------------------
    // CHECKOUT URL
    // --------------------------------------------------

    const frontendUrl =
      process.env.FRONTEND_URL ||
      "http://localhost:3000";


    const successUrl =
      `${frontendUrl}/payment/success`;


    const cancelUrl =
      `${frontendUrl}/payment/cancel`;


    const checkoutUrl =
      safepay.checkouts.payment.create({

        tracker:
          trackerToken,

        tbt:
          authenticationToken,

        environment:
          SAFEPAY_ENVIRONMENT,

        source:
          "hosted",

        redirect_url:
          successUrl,

        cancel_url:
          cancelUrl

      });


    if (!checkoutUrl) {

      return res.status(500).json({

        success: false,

        message:
          "Failed to generate Safepay checkout URL."

      });

    }


    console.log(
      "Checkout URL:",
      checkoutUrl
    );


    // --------------------------------------------------
    // SAVE PENDING PAYMENT
    // --------------------------------------------------

    try {

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

      }

    } catch (databaseError) {

      console.error(
        "Supabase error:",
        databaseError
      );

      // Do not prevent checkout because
      // logging the pending payment failed.

    }


    // --------------------------------------------------
    // RETURN TO FRONTEND
    // --------------------------------------------------

    return res.status(200).json({

      success: true,

      orderId:

        orderId,

      packageId:

        packageId,

      credits:

        credits,

      amount:

        price,

      currency:

        currency,

      trackerToken:

        trackerToken,

      checkoutUrl:

        checkoutUrl

    });


  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "SAFEPAY CREATE TRACKER ERROR"
    );

    console.error(
      error
    );

    console.error(
      "======================================"
    );


    return res.status(
      error?.statusCode || 500
    ).json({

      success: false,

      message:
        error?.message ||
        "Failed to create Safepay payment.",

      error:
        process.env.NODE_ENV === "development"
          ? String(error)
          : undefined

    });

  }

};


// ======================================================
// VERIFY SAFEPAY PAYMENT
// ======================================================

export const verifySafepayPayment = async (
  req,
  res
) => {

  try {

    const {
      trackerToken
    } = req.body || {};


    // --------------------------------------------------
    // Validate tracker
    // --------------------------------------------------

    if (!trackerToken) {

      return res.status(400).json({

        success: false,

        message:
          "trackerToken is required."

      });

    }


    // --------------------------------------------------
    // Supabase
    // --------------------------------------------------

    const supabase =
      getSupabaseClient();


    // --------------------------------------------------
    // Safepay
    // --------------------------------------------------

    const safepay =
      getSafepayClient();


    // --------------------------------------------------
    // Fetch payment using Reporter API
    //
    // Current SDK method:
    //
    // safepay.reporter.payments.fetch()
    // --------------------------------------------------

    const paymentResponse =
      await safepay.reporter.payments.fetch(
        trackerToken
      );


    console.log(
      "Safepay payment status:",
      JSON.stringify(
        paymentResponse,
        null,
        2
      )
    );


    const tracker =
      paymentResponse?.data;


    if (!tracker) {

      return res.status(400).json({

        success: false,

        message:
          "Safepay returned no payment information."

      });

    }


    // --------------------------------------------------
    // Determine state
    // --------------------------------------------------

    const paymentState =
      tracker?.tracker?.state ||
      tracker?.state;


    console.log(
      "Payment state:",
      paymentState
    );


    // --------------------------------------------------
    // Only process completed payment
    // --------------------------------------------------

    if (
      paymentState !==
        "TRACKER_ENDED" &&
      paymentState !==
        "PAID"
    ) {

      return res.status(400).json({

        success: false,

        message:
          `Payment is not completed. Current status: ${paymentState || "UNKNOWN"}`

      });

    }


    // --------------------------------------------------
    // Check whether payment already processed
    // --------------------------------------------------

    const {
      data: existingPayment,
      error: existingPaymentError
    } =
      await supabase
        .from("payments")
        .select(
          "id, user_id, package_id, credits, status"
        )
        .eq(
          "tracker_token",
          trackerToken
        )
        .maybeSingle();


    if (existingPaymentError) {

      console.error(
        "Payment lookup error:",
        existingPaymentError
      );

    }


    if (
      existingPayment &&
      existingPayment.status === "PAID"
    ) {

      return res.status(200).json({

        success: true,

        alreadyProcessed:
          true,

        message:
          "Payment has already been processed."

      });

    }


    // --------------------------------------------------
    // Get payment metadata
    // --------------------------------------------------

    const metadata =
      tracker?.tracker?.metadata ||
      tracker?.metadata ||
      {};


    let packageId =
      metadata.package_id;


    let userIdentifier =
      metadata.user_identifier;


    // --------------------------------------------------
    // If metadata isn't available, use database
    // --------------------------------------------------

    if (
      !packageId ||
      !userIdentifier
    ) {

      const {
        data: pendingPayment
      } =
        await supabase
          .from("payments")
          .select(
            "user_id, package_id, credits"
          )
          .eq(
            "tracker_token",
            trackerToken
          )
          .maybeSingle();


      if (pendingPayment) {

        packageId =
          packageId ||
          pendingPayment.package_id;

        userIdentifier =
          userIdentifier ||
          pendingPayment.user_id;

      }

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
          "Unable to determine purchased package."

      });

    }


    const addedCredits =
      selectedPackage.credits;


    // --------------------------------------------------
    // Validate user
    // --------------------------------------------------

    if (!userIdentifier) {

      return res.status(400).json({

        success: false,

        message:
          "Unable to determine user."

      });

    }


    // --------------------------------------------------
    // Find user
    // --------------------------------------------------

    const isEmail =
      String(userIdentifier).includes("@");


    const queryColumn =
      isEmail
        ? "email"
        : "id";


    const {
      data: userData,
      error: userError
    } =
      await supabase
        .from("users")
        .select(
          "id, credits"
        )
        .eq(
          queryColumn,
          userIdentifier
        )
        .maybeSingle();


    if (userError) {

      console.error(
        "User lookup error:",
        userError
      );

      return res.status(500).json({

        success: false,

        message:
          "Failed to find user."

      });

    }


    if (!userData) {

      return res.status(404).json({

        success: false,

        message:
          "User not found."

      });

    }


    // --------------------------------------------------
    // Calculate new credits
    // --------------------------------------------------

    const currentCredits =
      Number(userData.credits) || 0;


    const newCreditBalance =
      currentCredits +
      addedCredits;


    // --------------------------------------------------
    // Update credits
    // --------------------------------------------------

    const {
      error: creditUpdateError
    } =
      await supabase
        .from("users")
        .update({

          credits:
            newCreditBalance

        })
        .eq(
          "id",
          userData.id
        );


    if (creditUpdateError) {

      console.error(
        "Credit update error:",
        creditUpdateError
      );

      return res.status(500).json({

        success: false,

        message:
          "Payment verified, but credits could not be updated."

      });

    }


    // --------------------------------------------------
    // Record payment
    // --------------------------------------------------

    const {
      error: paymentInsertError
    } =
      await supabase
        .from("payments")
        .upsert({

          tracker_token:
            trackerToken,

          user_id:
            userData.id,

          package_id:
            packageId,

          credits:
            addedCredits,

          amount:
            selectedPackage.price,

          currency:
            selectedPackage.currency,

          status:
            "PAID"

        }, {

          onConflict:
            "tracker_token"

        });


    if (paymentInsertError) {

      console.error(
        "Payment recording error:",
        paymentInsertError
      );

      return res.status(500).json({

        success: false,

        message:
          "Credits were updated but payment record could not be saved."

      });

    }


    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(200).json({

      success: true,

      alreadyProcessed:
        false,

      message:
        `Payment successful! Added ${addedCredits} credits.`,

      addedCredits:

        addedCredits,

      newCreditBalance:

        newCreditBalance,

      trackerToken:

        trackerToken

    });


  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "SAFEPAY PAYMENT VERIFICATION ERROR"
    );

    console.error(
      error
    );

    console.error(
      "======================================"
    );


    return res.status(500).json({

      success: false,

      message:
        error?.message ||
        "Error verifying Safepay payment."

    });

  }

};
