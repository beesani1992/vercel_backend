import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './authService.js';
import db from './db.js'; // PostgreSQL pg Pool instance

const router = express.Router();

// Middleware to authenticate JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// GET /api/credits - Fetch Current Balance
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, credits: result.rows[0].credits });
  } catch (error) {
    console.error('Error fetching credits:', error.message);
    res.status(500).json({ success: false, message: 'Database error fetching credits' });
  }
});

// POST /api/credits/update - Add Credits Atomically (PostgreSQL)
router.post('/update', authenticateToken, async (req, res) => {
  const { amountToAdd } = req.body;
  const userId = req.user.id;
  const addedAmount = Number(amountToAdd) || 100;

  try {
    // Atomic PostgreSQL UPDATE with RETURNING clause
    const result = await db.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits',
      [addedAmount, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      newBalance: result.rows[0].credits,
      message: `Successfully added ${addedAmount} credits!`
    });
  } catch (error) {
    console.error('Error updating credits:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update credits in database' });
  }
});

export default router;
