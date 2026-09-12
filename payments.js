import express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
  let { userId, email, packageId, amount, creditsRequested, transactionId, paymentMethod } = req.body;

  // 1. Fallback: Extract email and userId from Authorization Header if missing in req.body
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.decode(token); // Decodes payload without verification step
      if (decoded) {
        if (!email) email = decoded.email || decoded.user_email || null;
        if (!userId) userId = decoded.id || decoded.userId || decoded.sub || null;
      }
    } catch (jwtErr) {
      console.warn('JWT Payload Decode Warning:', jwtErr.message);
    }
  }

  // 2. Validate that we have at least one user identifier
  if (!email && !userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'User identifier missing. Please log in again.' 
    });
  }

  try {
    // 3. Insert payment record into Supabase
    const { data, error } = await supabaseAdmin
      .from('manual_payments')
      .insert([
        {
          user_id: userId || null,
          email: email || null,
          package_id: packageId || 'custom',
          amount: parseFloat(amount),
          credits_requested: parseInt(creditsRequested, 10),
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
      message: 'Payment details submitted successfully! Awaiting manual approval.',
      payment: data[0]
    });
  } catch (err) {
    console.error('Payment Submission Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to record payment details.' 
    });
  }
});

export default router;
