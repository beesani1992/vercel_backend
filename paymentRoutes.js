const express = require('express');
const router = express.Router();
const { verifySafepayPayment } = require('../paymentController');

// POST /api/payments/verify-safepay
router.post('/verify-safepay', verifySafepayPayment);

module.exports = router;
