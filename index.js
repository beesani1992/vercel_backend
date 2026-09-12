// api/index.js
import express from 'express';
import cors from 'cors';
import paymentRoutes from './payments.js';

const app = express();

app.use(cors());
app.use(express.json());

// Mount routes
app.use('/payments', paymentRoutes);

export default app;
