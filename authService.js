import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_jwt_secret';

// 1. REGISTER USER
export async function registerUser(username, email, password) {
  try {
    const cleanUsername = (username && username.trim() !== '') ? username.trim() : null;
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    if (!cleanEmail || !password) {
      return { success: false, message: 'Email and password are required' };
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 OR (username IS NOT NULL AND username = $2)',
      [cleanEmail, cleanUsername]
    );

    if (existingUser.rows.length > 0) {
      return { success: false, message: 'Email or Username is already registered' };
    }

    // Hash password and insert
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, password, credits, is_verified) VALUES ($1, $2, $3, $4, 0) RETURNING id, username, email, credits',
      [cleanUsername, cleanEmail, hashedPassword, 70]
    );

    return {
      success: true,
      user: result.rows[0],
      message: 'User registered successfully!'
    };
  } catch (error) {
    console.error('Error in registerUser:', error);
    return { 
      success: false, 
      message: 'Database error during registration', 
      detail: error.message 
    };
  }
}

// 2. LOGIN USER
export async function loginUser(email, password) {
  try {
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    if (!cleanEmail || !password) {
      return { success: false, message: 'Email and password are required' };
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const user = result.rows[0];

    if (!user) {
      return { success: false, message: 'Invalid email or password' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return { success: false, message: 'Invalid email or password' };
    }

    // Check verification status (handles numeric 0 or boolean false)
    if (user.is_verified === 0 || user.is_verified === false || !user.is_verified) {
      return {
        success: false,
        requiresOtp: true,
        email: user.email,
        message: 'Please verify your email before logging in.'
      };
    }

    // Issue JWT Token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        credits: user.credits
      },
      message: 'Login successful'
    };
  } catch (error) {
    console.error('Error in loginUser:', error);
    return { 
      success: false, 
      message: 'Database error during login', 
      detail: error.message 
    };
  }
}

// 3. GET USER PROFILE
export async function getUserProfile(userId) {
  try {
    const result = await db.query('SELECT id, username, email, credits, is_verified FROM users WHERE id = $1', [userId]);
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
    const result = await db.query(
      `UPDATE users 
       SET credits = credits - $1 
       WHERE id = $2 AND credits >= $1 
       RETURNING credits`,
      [cost, userId]
    );

    if (result.rows.length === 0) {
      const userCheck = await db.query('SELECT credits FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return { success: false, message: 'User not found' };
      }
      return { success: false, message: 'Insufficient credits' };
    }

    return {
      success: true,
      remainingCredits: result.rows[0].credits,
      message: 'Credits deducted successfully'
    };
  } catch (error) {
    console.error('Error in deductCredits:', error);
    return { success: false, message: 'Database error during credit deduction', detail: error.message };
  }
}
