import express from 'express';
import { createSafepayTracker, verifySafepayPayment } from './paymentController.js';

const router = express.Router();

// Tracker creation endpoint (handles both kebab-case and camelCase)
router.post(['/create-safepay-tracker', '/createSafepayTracker'], createSafepayTracker);

// Verification endpoint (handles all front-end naming variations)
router.post(['/verify-safepay', '/verify-safepay-payment', '/verifySafepayPayment'], verifySafepayPayment);

export default router;
