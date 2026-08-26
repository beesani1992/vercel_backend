import express from 'express';
import jwt from 'jsonwebtoken';
import { getUserCredits, JWT_SECRET } from './authService.js';
import db from './db.js';

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

// POST /api/credits/update
router.post('/update', authenticateToken, (req, res) => {
  const { amountToAdd } = req.body;
  const userId = req.user.id;
  const addedAmount = Number(amountToAdd) || 100;

  try {
    const currentCredits = getUserCredits(userId);
    const newBalance = currentCredits + addedAmount;

    // Update credits in SQLite database using better-sqlite3
    const stmt = db.prepare('UPDATE users SET credits = ? WHERE id = ?');
    stmt.run(newBalance, userId);

    res.json({
      success: true,
      newBalance: newBalance,
      message: `Successfully added ${addedAmount} credits!`
    });
  } catch (error) {
    console.error('Error updating credits:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update credits in database' });
  }
});

export default router;