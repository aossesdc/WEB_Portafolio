const express = require('express');
const { tickets } = require('../data/mockData');
const { calculateConsumedPercentage, getRiskLevel, getRiskClass } = require('../utils/sla');
const { sendCriticalRiskAlert } = require('../services/emailService');

const router = express.Router();

function enrichTicket(ticket) {
  const percentage = calculateConsumedPercentage(ticket);
  return {
    ...ticket,
    consumedPercentage: Number(percentage.toFixed(1)),
    riskLevel: getRiskLevel(percentage),
    riskClass: getRiskClass(percentage)
  };
}

router.get('/', (req, res) => {
  res.json({
    ok: true,
    data: tickets.map(enrichTicket)
  });
});

router.post('/external', (req, res) => {
  const payload = req.body || {};

  if (!payload.id || !payload.client || !payload.clientEmail || !payload.contractHours) {
    return res.status(400).json({
      ok: false,
      message: 'Faltan campos obligatorios para integrar el ticket externo.'
    });
  }

  const newTicket = {
    id: payload.id,
    client: payload.client,
    clientEmail: payload.clientEmail,
    contractHours: Number(payload.contractHours),
    elapsedHours: Number(payload.elapsedHours || 0),
    pausedHours: Number(payload.pausedHours || 0),
    status: payload.status || 'activo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    risk: getRiskLevel(calculateConsumedPercentage({
      elapsedHours: Number(payload.elapsedHours || 0),
      pausedHours: Number(payload.pausedHours || 0),
      contractHours: Number(payload.contractHours)
    }))
  };

  tickets.unshift(newTicket);

  return res.status(201).json({
    ok: true,
    message: 'Ticket externo integrado correctamente.',
    data: enrichTicket(newTicket)
  });
});

router.get('/:id', (req, res) => {
  const ticket = tickets.find(item => item.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
  }

  return res.json({ ok: true, data: enrichTicket(ticket) });
});

router.post('/:id/send-critical-email', async (req, res) => {
  const ticket = tickets.find(item => item.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
  }

  const result = await sendCriticalRiskAlert(ticket, ticket.clientEmail);

  return res.json({
    ok: true,
    ticketId: ticket.id,
    email: result
  });
});

module.exports = router;
