import dotenv from 'dotenv';
dotenv.config();

import app from './server.js';
import authRoutes from './authRoutes.js';
import creditRoutes from './creditRoutes.js';

// 1. Attach authentication endpoints
app.use('/api/auth', authRoutes);

// 2. Attach credit endpoints
app.use('/api/credits', creditRoutes);

const PORT = process.env.PORT || 5000;

// Only start standard HTTP listener when running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server wrapper running on port ${PORT} with auth & credit routes.`);
  });
}

// Export default app instance (Required for Vercel Serverless Functions)
export default app;