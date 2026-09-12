import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
  const { userId, email, packageId, amount, creditsRequested, transactionId, paymentMethod } = req.body;

  if (!email && !userId) {
    return res.status(400).json({ success: false, message: 'User identifier missing.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('manual_payments')
      .insert([
        {
          user_id: userId || null,
          email: email,
          package_id: packageId,
          amount: parseFloat(amount),
          credits_requested: parseInt(creditsRequested, 10),
          transaction_id: transactionId,
          payment_method: paymentMethod,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Payment details submitted successfully! Awaiting manual approval.',
      payment: data[0]
    });
  } catch (err) {
    console.error('Payment Submission Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record payment details.' });
  }
});

export default router;
