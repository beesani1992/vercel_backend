import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import db from './db.js';
import { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  getUserCredits, 
  deductCredits, 
  JWT_SECRET 
} from './authService.js';

const router = express.Router();

// Transporter Config
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Authentication Middleware
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

// REGISTER ROUTE
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const finalUsername = username || (email ? email.split('@')[0] : '');

  const result = await registerUser(finalUsername, email, password);
  if (!result.success) return res.status(400).json(result);

  try {
    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save OTP to Supabase Postgres
    await db.query(
      'UPDATE users SET otp = $1, otp_expires = $2, is_verified = 0 WHERE email = $3',
      [otp, otpExpires, email]
    );

    // Send OTP Email
    await transporter.sendMail({
      from: `"Your App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #111; color: #fff;">
          <h2>Email Verification</h2>
          <p>Your 6-digit verification code is:</p>
          <h1 style="color: #00f3ff; letter-spacing: 4px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      requiresOtp: true,
      email,
      message: 'Registration initiated. OTP sent to your email address.',
    });
  } catch (error) {
    console.error('Email Dispatch Error:', error);
    res.status(500).json({ success: false, message: 'User created, but failed to send OTP email.' });
  }
});

// VERIFY OTP ROUTE
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.is_verified === 1) {
      return res.status(400).json({ success: false, message: 'Account already verified' });
    }

    if (user.otp !== otp || Date.now() > Number(user.otp_expires)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Update verified status
    await db.query('UPDATE users SET is_verified = 1, otp = NULL, otp_expires = NULL WHERE email = $1', [email]);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      credits: user.credits,
      message: 'Email verified successfully!',
    });
  } catch (error) {
    console.error('OTP Verification Error:', error);
    res.status(500).json({ success: false, message: 'OTP verification failed' });
  }
});

// RESEND OTP ROUTE
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const newOtp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    await db.query('UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3', [newOtp, otpExpires, email]);

    await transporter.sendMail({
      from: `"Your App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'New Verification Code',
      html: `<h2>Your new OTP code is: <b style="color:#00f3ff">${newOtp}</b></h2>`,
    });

    res.json({ success: true, message: 'A new OTP has been sent to your email.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await loginUser(email, password);
  if (!result.success) return res.status(401).json(result);
  res.json(result);
});

// PROFILE ROUTE
router.get('/profile', authenticateToken, async (req, res) => {
  const profile = await getUserProfile(req.user.id);
  res.json(profile);
});

// CREDITS ROUTE
router.get('/credits', authenticateToken, async (req, res) => {
  const credits = await getUserCredits(req.user.id);
  res.json({ credits });
});

// USE CREDIT ROUTE
router.post('/use-credit', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const cost = amount || 1;

  const result = await deductCredits(req.user.id, cost);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({ message: 'Credit used successfully!', remainingCredits: result.remainingCredits });
});

export default router;