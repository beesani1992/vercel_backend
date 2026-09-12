// api/payments.js
import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
  const { email, amount, transactionId, paymentMethod } = req.body;

  if (!email || !amount || !transactionId) {
    return res.status(400).json({ message: 'Missing required fields: email, amount, or transaction ID.' });
  }

  try {
    // Service role connection inserts directly into DB without RLS blocks
    const { data, error } = await supabaseAdmin
      .from('manual_payments')
      .insert([
        {
          email: email,
          amount: parseFloat(amount),
          transaction_id: transactionId,
          payment_method: paymentMethod || 'bank_transfer',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Payment submitted successfully!',
      payment: data[0]
    });
  } catch (err) {
    console.error('Backend Payment Insert Error:', err.message);
    return res.status(500).json({ message: 'Failed to record payment details.' });
  }
});

export default router;
