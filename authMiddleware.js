import jwt from 'jsonwebtoken';

const JWT_SECRET = '29963ae672c4af92ef6c298a1509fa01bcf42f520a4205230dba314ae751a61a';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token' });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decodedUser;
    next();
  });
}
