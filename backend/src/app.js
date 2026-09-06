const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const ticketsRoutes = require('./routes/tickets');
const reportsRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'SLA Control Backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/reports', reportsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    message: 'Error interno del servidor',
    detail: err.message
  });
});

module.exports = app;
