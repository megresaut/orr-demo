// server.js — ORR MVP entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const orgRoutes = require('./routes/orgRoutes');
const projectRoutes = require('./routes/projectRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

// CORS: allow comma-separated list from FRONTEND_ORIGIN, plus common local dev ports.
// In single-service deploys (frontend dist served by this process), browsers won't
// hit CORS at all — the allowlist is only relevant when the frontend is hosted separately.
const envOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = [
  ...envOrigins,
  'http://localhost:9100',
  'http://localhost:9000',
  'http://[::1]:9000',
  'http://localhost:5173',
  'http://localhost:4173',
];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', product: 'ORR — Operation, Resource, Revenue' });
});

app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/invoices', express.static(path.join(__dirname, 'invoices')));

// Single-service deploy: serve the built frontend, with SPA fallback for client routes.
// Does nothing in dev (Vite serves the frontend from a separate port).
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api\/|\/invoices\/).*/, (req, res, next) => {
    const indexPath = path.join(FRONTEND_DIST, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    next();
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error('[orr] uncaught error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5060;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[orr] listening on http://0.0.0.0:${PORT}`);
});
