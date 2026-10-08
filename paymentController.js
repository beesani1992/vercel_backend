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

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";


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
// EMAIL VALIDATION
// ======================================================

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const normalizeEmail = (email) => {
  if (
    !email ||
    typeof email !== "string"
  ) {
    return null;
  }

  return email.trim().toLowerCase();
};


// ======================================================
// SUPABASE CLIENT
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
// CREATE SAFEPAY AUTHENTICATION TOKEN
// ======================================================
//
// IMPORTANT:
// We intentionally do NOT use:
//
// safepay.passport.create()
// safepay.auth.passport.create()
//
// because your installed SDK instance is returning:
//
// Cannot read properties of undefined (reading 'create')
//
// Safepay documents this endpoint:
//
// POST /client/passport/v1/token
//
// ======================================================

const createSafepayAuthenticationToken =
  async () => {

    console.log(
      "[Safepay] Creating authentication token..."
    );

    const response =
      await fetch(
        `${SAFEPAY_HOST}/client/passport/v1/token`,
        {
          method: "POST",

          headers: {
            "X-SFPY-MERCHANT-SECRET":
              SAFEPAY_SECRET_KEY,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({})
        }
      );

    let responseData = null;

    try {
      responseData =
        await response.json();
    } catch {
      responseData = null;
    }

    console.log(
      "[Safepay] Authentication token HTTP status:",
      response.status
    );

    if (!response.ok) {

      console.error(
        "[Safepay] Authentication token error:",
        responseData
      );

      const errorMessage =
        responseData?.message ||
        responseData?.error ||
        `Safepay authentication request failed with HTTP ${response.status}.`;

      throw new Error(
        errorMessage
      );
    }

    const authenticationToken =
      responseData?.data;

    if (
      !authenticationToken ||
      typeof authenticationToken !== "string"
    ) {

      console.error(
        "[Safepay] Invalid authentication response:",
        responseData
      );

      throw new Error(
        "Safepay did not return a valid authentication token."
      );
    }

    console.log(
      "[Safepay] Authentication token created successfully."
    );

    return authenticationToken;
  };


// ======================================================
// CREATE SAFEPAY PAYMENT SESSION
// ======================================================

export const createSafepayTracker =
  async (req, res) => {

    try {

      // --------------------------------------------------
      // Validate environment
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
        userEmail
      } = req.body || {};


      // --------------------------------------------------
      // Validate package
      // --------------------------------------------------

      if (!packageId) {
        return res.status(400).json({
          success: false,
          message:
            "packageId is required."
        });
      }

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


      // --------------------------------------------------
      // Validate email
      // --------------------------------------------------

      const normalizedUserEmail =
        normalizeEmail(userEmail);

      if (!normalizedUserEmail) {
        return res.status(400).json({
          success: false,
          message:
            "userEmail is required."
        });
      }

      if (
        !EMAIL_REGEX.test(
          normalizedUserEmail
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid userEmail is required."
        });
      }


      // --------------------------------------------------
      // Package values
      // --------------------------------------------------

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
      // Safepay amount
      // --------------------------------------------------
      //
      // $5  = 500 cents
      // $20 = 2000 cents
      // $50 = 5000 cents
      //
      // --------------------------------------------------

      const amountInLowestDenomination =
        Math.round(price * 100);


      console.log(
        "======================================"
      );

      console.log(
        "[Safepay] Creating payment session"
      );

      console.log(
        "[Safepay] Package:",
        packageId
      );

      console.log(
        "[Safepay] Credits:",
        credits
      );

      console.log(
        "[Safepay] Price:",
        price,
        currency
      );

      console.log(
        "[Safepay] Amount:",
        amountInLowestDenomination
      );

      console.log(
        "[Safepay] User:",
        normalizedUserEmail
      );

      console.log(
        "[Safepay] Order:",
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
      // CREATE PAYMENT SESSION / TRACKER
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
              orderId
          }

        });


      console.log(
        "[Safepay] Payment session created."
      );

      console.log(
        "[Safepay] Payment response:",
        JSON.stringify(
          paymentResponse,
          null,
          2
        )
      );


      // --------------------------------------------------
      // Extract tracker
      // --------------------------------------------------

      const trackerToken =
        paymentResponse
          ?.data
          ?.tracker
          ?.token;


      if (!trackerToken) {

        console.error(
          "[Safepay] Tracker token missing:",
          paymentResponse
        );

        throw new Error(
          "Safepay did not return a tracker token."
        );
      }


      console.log(
        "[Safepay] Tracker:",
        trackerToken
      );


      // --------------------------------------------------
      // CREATE AUTHENTICATION TOKEN
      // --------------------------------------------------

      const authenticationToken =
        await createSafepayAuthenticationToken();


      // --------------------------------------------------
      // CREATE HOSTED CHECKOUT URL
      // --------------------------------------------------
      //
      // This uses the official node-core checkout
      // helper documented by Safepay.
      //
      // --------------------------------------------------

      if (
        !safepay.checkouts ||
        !safepay.checkouts.payment ||
        typeof safepay.checkouts.payment.create !==
          "function"
      ) {

        throw new Error(
          "Installed @sfpy/node-core does not expose safepay.checkouts.payment.create(). Please update @sfpy/node-core."
        );
      }


      const successUrl =
        `${FRONTEND_URL}/payment/success`;

      const cancelUrl =
        `${FRONTEND_URL}/payment/cancel`;


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


      if (
        !checkoutUrl ||
        typeof checkoutUrl !== "string"
      ) {

        console.error(
          "[Safepay] Invalid checkout URL:",
          checkoutUrl
        );

        throw new Error(
          "Safepay failed to generate the checkout URL."
        );
      }


      console.log(
        "[Safepay] Checkout URL generated."
      );


      // --------------------------------------------------
      // SAVE PENDING PAYMENT
      // --------------------------------------------------
      //
      // IMPORTANT:
      // This record is required because Safepay metadata
      // only contains order_id.
      //
      // package_id and user_email are stored in our DB.
      //
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

            user_email:
              normalizedUserEmail,

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
          "[Supabase] Payment insert error:",
          databaseError
        );

        throw new Error(
          `Unable to save pending payment: ${databaseError.message}`
        );
      }


      console.log(
        "[Supabase] Pending payment saved."
      );


      // --------------------------------------------------
      // RETURN TO FRONTEND
      // --------------------------------------------------

      return res.status(200).json({

        success:
          true,

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

        userEmail:
          normalizedUserEmail,

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
        "[Safepay] CREATE TRACKER ERROR"
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

        success:
          false,

        message:
          error?.message ||
          "Failed to create Safepay payment."

      });
    }
  };


// ======================================================
// VERIFY SAFEPAY PAYMENT
// ======================================================

export const verifySafepayPayment =
  async (req, res) => {

    try {

      // --------------------------------------------------
      // Request body
      // --------------------------------------------------

      const {
        trackerToken
      } = req.body || {};


      if (!trackerToken) {

        return res.status(400).json({

          success:
            false,

          message:
            "trackerToken is required."

        });
      }


      // --------------------------------------------------
      // Clients
      // --------------------------------------------------

      const supabase =
        getSupabaseClient();

      const safepay =
        getSafepayClient();


      // --------------------------------------------------
      // Ask Safepay for current payment status
      // --------------------------------------------------

      const paymentResponse =
        await safepay
          .reporter
          .payments
          .fetch(
            trackerToken
          );


      console.log(
        "[Safepay] Verification response:",
        JSON.stringify(
          paymentResponse,
          null,
          2
        )
      );


      // --------------------------------------------------
      // Extract tracker
      // --------------------------------------------------

      const tracker =
        paymentResponse?.data;


      if (!tracker) {

        return res.status(400).json({

          success:
            false,

          message:
            "Safepay returned no payment information."

        });
      }


      // --------------------------------------------------
      // Payment state
      // --------------------------------------------------

      const paymentState =
        tracker?.tracker?.state ||
        tracker?.state;


      console.log(
        "[Safepay] Payment state:",
        paymentState
      );


      // --------------------------------------------------
      // Payment must be completed
      // --------------------------------------------------

      if (
        paymentState !== "TRACKER_ENDED" &&
        paymentState !== "PAID"
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            `Payment is not completed. Current status: ${
              paymentState || "UNKNOWN"
            }`

        });
      }


      // --------------------------------------------------
      // Find our pending payment
      // --------------------------------------------------

      const {
        data: existingPayment,
        error: existingPaymentError
      } =
        await supabase
          .from("payments")
          .select(
            "id, order_id, user_id, user_email, package_id, credits, amount, currency, status"
          )
          .eq(
            "tracker_token",
            trackerToken
          )
          .maybeSingle();


      if (existingPaymentError) {

        console.error(
          "[Supabase] Payment lookup error:",
          existingPaymentError
        );

        return res.status(500).json({

          success:
            false,

          message:
            "Failed to find payment record."

        });
      }


      if (!existingPayment) {

        return res.status(404).json({

          success:
            false,

          message:
            "Payment record was not found in the database."

        });
      }


      // --------------------------------------------------
      // Prevent double crediting
      // --------------------------------------------------

      if (
        existingPayment.status ===
        "PAID"
      ) {

        return res.status(200).json({

          success:
            true,

          alreadyProcessed:
            true,

          message:
            "Payment has already been processed.",

          addedCredits:
            Number(
              existingPayment.credits
            ) || 0,

          userEmail:
            existingPayment.user_email,

          packageId:
            existingPayment.package_id,

          orderId:
            existingPayment.order_id

        });
      }


      // --------------------------------------------------
      // Get package from OUR database
      // --------------------------------------------------

      const packageId =
        existingPayment.package_id;

      const selectedPackage =
        PACKAGES[packageId];


      if (!selectedPackage) {

        return res.status(400).json({

          success:
            false,

          message:
            `Invalid package stored in payment record: ${packageId}`

        });
      }


      const addedCredits =
        selectedPackage.credits;


      // --------------------------------------------------
      // Get user email from OUR database
      // --------------------------------------------------

      const userEmail =
        normalizeEmail(
          existingPayment.user_email
        );


      if (!userEmail) {

        return res.status(400).json({

          success:
            false,

          message:
            "Payment record does not contain a valid userEmail."

        });
      }


      // --------------------------------------------------
      // Find user by email
      // --------------------------------------------------

      const {
        data: userData,
        error: userError
      } =
        await supabase
          .from("users")
          .select(
            "id, email, credits"
          )
          .eq(
            "email",
            userEmail
          )
          .maybeSingle();


      if (userError) {

        console.error(
          "[Supabase] User lookup error:",
          userError
        );

        return res.status(500).json({

          success:
            false,

          message:
            "Failed to find user."

        });
      }


      if (!userData) {

        return res.status(404).json({

          success:
            false,

          message:
            `User not found for email: ${userEmail}`

        });
      }


      // --------------------------------------------------
      // Current credits
      // --------------------------------------------------

      const currentCredits =
        Number(
          userData.credits
        ) || 0;


      const newCreditBalance =
        currentCredits +
        addedCredits;


      // --------------------------------------------------
      // Update user credits
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
          "[Supabase] Credit update error:",
          creditUpdateError
        );

        return res.status(500).json({

          success:
            false,

          message:
            "Payment verified, but credits could not be updated."

        });
      }


      // --------------------------------------------------
      // Mark payment as PAID
      // --------------------------------------------------

      const {
        error: paymentUpdateError
      } =
        await supabase
          .from("payments")
          .update({

            user_id:
              userData.id,

            user_email:
              userEmail,

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

          })
          .eq(
            "tracker_token",
            trackerToken
          );


      if (paymentUpdateError) {

        console.error(
          "[Supabase] Payment update error:",
          paymentUpdateError
        );

        return res.status(500).json({

          success:
            false,

          message:
            "Credits were updated but payment status could not be saved."

        });
      }


      // --------------------------------------------------
      // SUCCESS
      // --------------------------------------------------

      console.log(
        "======================================"
      );

      console.log(
        "[Safepay] PAYMENT VERIFIED"
      );

      console.log(
        "[Safepay] User:",
        userEmail
      );

      console.log(
        "[Safepay] Package:",
        packageId
      );

      console.log(
        "[Safepay] Added credits:",
        addedCredits
      );

      console.log(
        "[Safepay] New balance:",
        newCreditBalance
      );

      console.log(
        "======================================"
      );


      return res.status(200).json({

        success:
          true,

        alreadyProcessed:
          false,

        message:
          `Payment successful! Added ${addedCredits} credits.`,

        addedCredits:
          addedCredits,

        newCreditBalance:
          newCreditBalance,

        userEmail:
          userEmail,

        packageId:
          packageId,

        orderId:
          existingPayment.order_id,

        trackerToken:
          trackerToken

      });

    } catch (error) {

      console.error(
        "======================================"
      );

      console.error(
        "[Safepay] PAYMENT VERIFICATION ERROR"
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

        success:
          false,

        message:
          error?.message ||
          "Error verifying Safepay payment."

      });
    }
  };
