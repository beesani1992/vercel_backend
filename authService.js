import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from './db.js'; // Imports the pg Pool instance

export const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_jwt_secret';

// 1. REGISTER USER
export async function registerUser(username, email, password) {
  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return { success: false, message: 'Email is already registered' };
    }

    // Hash password and insert
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, password, credits, is_verified) VALUES ($1, $2, $3, $4, 0) RETURNING id, username, email, credits',
      [username, email, hashedPassword, 10]
    );

    return {
      success: true,
      user: result.rows[0],
      message: 'User registered successfully!'
    };
  } catch (error) {
    console.error('Error in registerUser:', error);
    return { success: false, message: 'Database error during registration' };
  }
}

// 2. LOGIN USER
export async function loginUser(email, password) {
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return { success: false, message: 'Invalid email or password' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return { success: false, message: 'Invalid email or password' };
    }

    // Check verification status
    if (user.is_verified === 0) {
      return {
        success: false,
        requiresOtp: true,
        email: user.email,
        message: 'Please verify your email before logging in.'
      };
    }

    // Issue JWT Token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return {
      success: true,
      token,
      credits: user.credits,
      message: 'Login successful'
    };
  } catch (error) {
    console.error('Error in loginUser:', error);
    return { success: false, message: 'Database error during login' };
  }
}

// 3. GET USER PROFILE
export async function getUserProfile(userId) {
  try {
    const result = await db.query('SELECT id, username, email, credits FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return null;
  }
}

// 4. GET USER CREDITS
export async function getUserCredits(userId) {
  try {
    const result = await db.query('SELECT credits FROM users WHERE id = $1', [userId]);
    return result.rows[0] ? result.rows[0].credits : 0;
  } catch (error) {
    console.error('Error in getUserCredits:', error);
    return 0;
  }
}

// 5. DEDUCT CREDITS
export async function deductCredits(userId, cost = 1) {
  try {
    const result = await db.query('SELECT credits FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (user.credits < cost) {
      return { success: false, message: 'Insufficient credits' };
    }

    const newBalance = user.credits - cost;
    await db.query('UPDATE users SET credits = $1 WHERE id = $2', [newBalance, userId]);

    return {
      success: true,
      remainingCredits: newBalance,
      message: 'Credits deducted successfully'
    };
  } catch (error) {
    console.error('Error in deductCredits:', error);
    return { success: false, message: 'Database error during credit deduction' };
  }
}