import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { authenticateToken } from './authMiddleware.js';

const router = express.Router();
const JWT_SECRET = '29963ae672c4af92ef6c298a1509fa01bcf42f520a4205230dba314ae751a61a';         

// 1. Register Route
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const stmt = db.prepare('INSERT INTO users (email, password, credits) VALUES (?, ?, 100)');
    const info = stmt.run(email, hashedPassword);

    const token = jwt.sign({ id: info.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 2. Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Deduct Credits Route (Protected)
router.post('/credits/use', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, action } = req.body;

    const transaction = db.transaction(() => {
      const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
      if (!user || user.credits < amount) {
        throw new Error('Insufficient credits');
      }

      db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(amount, userId);
      db.prepare('INSERT INTO credit_logs (user_id, amount, action) VALUES (?, ?, ?)').run(userId, -amount, action);

      return user.credits - amount;
    });

    const remainingCredits = transaction();
    res.json({ success: true, remainingCredits });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
