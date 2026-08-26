// backend/addCredits.js
import db from './db.js';

const userId = 1; // Change to target User ID
const creditsToAdd = 100;

const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
if (user) {
  const newBalance = (user.credits || 0) + creditsToAdd;
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, userId);
  console.log(`Updated user ${userId}. New Balance: ${newBalance}`);
} else {
  console.log('User not found.');
}