import express from 'express';
import jwt from 'jsonwebtoken';
import { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  getUserCredits, 
  deductCredits, 
  JWT_SECRET 
} from './authService.js';

const router = express.Router();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
}

router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  const result = registerUser(username, email, password);
  if (!result.success) return res.status(400).json(result);
  res.json({ message: 'User registered successfully!' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const result = loginUser(email, password);
  if (!result.success) return res.status(401).json(result);
  res.json(result);
});

router.get('/profile', authenticateToken, (req, res) => {
  const profile = getUserProfile(req.user.id);
  res.json(profile);
});

router.get('/credits', authenticateToken, (req, res) => {
  const credits = getUserCredits(req.user.id);
  res.json({ credits });
});

router.post('/use-credit', authenticateToken, (req, res) => {
  const { amount } = req.body;
  const cost = amount || 1;

  const result = deductCredits(req.user.id, cost);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({ message: 'Credit used successfully!', remainingCredits: result.remainingCredits });
});

export default router;