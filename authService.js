import db from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

export function registerUser(username, email, password) {
  const hashedPassword = bcrypt.hashSync(password, 10);
  const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
  
  try {
    const result = stmt.run(username, email, hashedPassword);
    return { success: true, userId: result.lastInsertRowid };
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, message: 'Username or email already exists.' };
    }
    throw err;
  }
}

export function loginUser(email, password) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return { success: false, message: 'Invalid credentials.' };
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  return { success: true, token, user: { id: user.id, username: user.username, email: user.email } };
}

export function getUserProfile(userId) {
  const stmt = db.prepare('SELECT id, username, email, credits, created_at FROM users WHERE id = ?');
  return stmt.get(userId);
}

export function getUserCredits(userId) {
  const stmt = db.prepare('SELECT credits FROM users WHERE id = ?');
  const result = stmt.get(userId);
  return result ? result.credits : 0;
}

export function deductCredits(userId, amount = 1) {
  const currentCredits = getUserCredits(userId);

  if (currentCredits < amount) {
    return { success: false, message: 'Insufficient credits!' };
  }

  const stmt = db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?');
  stmt.run(amount, userId);

  return { success: true, remainingCredits: currentCredits - amount };
}