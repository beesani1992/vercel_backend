import app from './server.js';
import authRoutes from './authRoutes.js';
import creditRoutes from './creditRoutes.js';

// Attach authentication endpoints to your original app
app.use('/api/auth', authRoutes);

// 2. Mount credit API routes
app.use('/api/credits', creditRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server wrapper running on port ${PORT} with auth routes attached.`);
});



// Mount credit API routes without altering existing endpoints
app.use('/api/credits', creditRoutes);