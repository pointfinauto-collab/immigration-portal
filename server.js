require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const connectDB = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const fileRoutes = require('./routes/fileRoutes');

const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global rate limiting
app.use('/api/', generalLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Immigration Portal API is running.', timestamp: new Date() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);

// Optional: serve frontend static files if placed in /public (for combined deployments)
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) return next();
  const indexFile = path.join(frontendPath, 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) next();
  });
});

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
