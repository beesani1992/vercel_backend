import express from 'express';
import { createSafepayTracker, verifySafepayPayment } from './paymentController.js';

const router = express.Router();

// POST /api/payments/create-safepay-tracker
router.post('/create-safepay-tracker', createSafepayTracker);

// POST /api/payments/verify-safepay
router.post('/verify-safepay', verifySafepayPayment);

export default router;
