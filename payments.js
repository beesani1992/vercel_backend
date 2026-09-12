import express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './supabaseAdmin.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
  // Guarantee CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    let { userId, email, packageId, amount, creditsRequested, transactionId, paymentMethod } = req.body || {};

    // 1. Decodes JWT payload from Authorization header if user identifiers are missing
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          if (!email) email = decoded.email || decoded.user_email || null;
          if (!userId) userId = decoded.id || decoded.userId || decoded.sub || null;
        }
      } catch (jwtErr) {
        console.warn('JWT parse failed:', jwtErr.message);
      }
    }

    if (!email && !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Could not identify user session. Please log in again.' 
      });
    }

    // 2. Insert record into Supabase
    const { data, error } = await supabaseAdmin
      .from('manual_payments')
      .insert([
        {
          user_id: userId || null,
          email: email || null,
          package_id: packageId || 'custom',
          amount: parseFloat(amount) || 0,
          credits_requested: parseInt(creditsRequested, 10) || 0,
          transaction_id: transactionId || '',
          payment_method: paymentMethod || 'bank_transfer',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('Supabase Error:', error.message);
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment details submitted successfully! Awaiting approval.',
      payment: data?.[0] || null
    });
  } catch (err) {
    console.error('Server Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Internal Server Error' 
    });
  }
});

export default router;
