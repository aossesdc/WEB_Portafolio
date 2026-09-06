const express = require('express');
const { tickets } = require('../data/mockData');
const { calculateConsumedPercentage, getRiskLevel } = require('../utils/sla');

const router = express.Router();

function buildTicketMetrics(ticket) {
  const percentage = calculateConsumedPercentage(ticket);
  const riskLabel = getRiskLevel(percentage);
  return {
    id: ticket.id,
    client: ticket.client,
    consumedPercentage: Number(percentage.toFixed(1)),
    risk: riskLabel,
    mttrHours: Number((ticket.elapsedHours / 10).toFixed(1)),
    finesAvoided: riskLabel.toLowerCase() === 'crítico' || riskLabel.toLowerCase() === 'critico' ? 12000 : 6500
  };
}

router.get('/sla', (req, res) => {
  const client = req.query.client || 'all';
  const start = req.query.start || '2026-08-01';
  const end = req.query.end || '2026-08-31';

  const filtered = tickets
    .filter(ticket => ticket.createdAt >= new Date(start).toISOString() && ticket.createdAt <= new Date(end).toISOString())
    .filter(ticket => client === 'all' || ticket.client === client)
    .map(buildTicketMetrics);

  const avgSla = filtered.length ? filtered.reduce((sum, item) => sum + item.consumedPercentage, 0) / filtered.length : 0;

  res.json({
    ok: true,
    filters: { client, start, end },
    summary: {
      averageConsumed: Number(avgSla.toFixed(1)),
      tickets: filtered.length,
      totalFinesAvoided: filtered.reduce((sum, item) => sum + item.finesAvoided, 0)
    },
    rows: filtered
  });
});

router.get('/maintenance', (req, res) => {
  const client = req.query.client || 'all';
  const filtered = tickets
    .filter(ticket => client === 'all' || ticket.client === client)
    .map(buildTicketMetrics);

  const avgMttr = filtered.length ? filtered.reduce((sum, item) => sum + item.mttrHours, 0) / filtered.length : 0;
  const totalAvoided = filtered.reduce((sum, item) => sum + item.finesAvoided, 0);

  res.json({
    ok: true,
    filters: { client },
    summary: {
      avgMttr: Number(avgMttr.toFixed(1)),
      totalAvoided: totalAvoided,
      tickets: filtered.length
    },
    rows: filtered
  });
});

router.get('/export/:format', (req, res) => {
  const { format } = req.params;
  const { client = 'all', start = '2026-08-01', end = '2026-08-31' } = req.query;

  const rows = tickets
    .filter(ticket => ticket.createdAt >= new Date(start).toISOString() && ticket.createdAt <= new Date(end).toISOString())
    .filter(ticket => client === 'all' || ticket.client === client)
    .map(buildTicketMetrics);

  if (!['pdf', 'xls'].includes(String(format).toLowerCase())) {
    return res.status(400).json({ ok: false, message: 'Formato no soportado. Usa pdf o xls.' });
  }

  const payload = {
    ok: true,
    format: String(format).toLowerCase(),
    generatedAt: new Date().toISOString(),
    filters: { client, start, end },
    rows,
    summary: {
      tickets: rows.length,
      averageConsumed: Number((rows.reduce((sum, item) => sum + item.consumedPercentage, 0) / (rows.length || 1)).toFixed(1)),
      totalFinesAvoided: rows.reduce((sum, item) => sum + item.finesAvoided, 0)
    }
  };

  if (format === 'xls') {
    return res.json({
      ...payload,
      fileType: 'application/vnd.ms-excel',
      filename: `sla-report-${Date.now()}.xls`,
      structure: 'id,client,consumedPercentage,risk,mttrHours,finesAvoided'
    });
  }

  return res.json({
    ...payload,
    fileType: 'application/pdf',
    filename: `sla-report-${Date.now()}.pdf`,
    layout: 'header|tabla|resumen|firmas'
  });
});

module.exports = router;
