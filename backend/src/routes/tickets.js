const express = require('express');
const crypto = require('crypto');
const { getAllTickets, getTicketById, getTicketsByClient, insertTicket, updateTicket } = require('../data/database');
const { calculateConsumedPercentage, getRiskLevel, getRiskClass } = require('../utils/sla');
const { sendCriticalRiskAlert } = require('../services/emailService');
const { authenticate, requireRole } = require('../middleware/authenticate');

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

router.get('/', authenticate, (req, res) => {
  const tickets = req.user.role === 'client'
    ? getTicketsByClient(req.user.email)
    : getAllTickets();

  res.json({
    ok: true,
    data: tickets.map(enrichTicket)
  });
});

router.post('/', authenticate, requireRole('client'), (req, res) => {
  const payload = req.body || {};
  const requiredFields = ['branch', 'category', 'service', 'description'];
  const missingField = requiredFields.find(field => typeof payload[field] !== 'string' || !payload[field].trim());

  if (missingField) {
    return res.status(400).json({ ok: false, message: 'Completa sucursal, categoría, servicio y descripción.' });
  }

  if (payload.description.trim().length > 500) {
    return res.status(400).json({ ok: false, message: 'La descripción no puede superar los 500 caracteres.' });
  }

  let id;
  do {
    id = `INC-${crypto.randomInt(100000, 1000000)}`;
  } while (getTicketById(id));

  const now = new Date().toISOString();
  const ticket = insertTicket({
    id,
    client: req.user.name,
    clientEmail: req.user.email,
    contractHours: 8,
    elapsedHours: 0,
    pausedHours: 0,
    status: 'activo',
    createdAt: now,
    updatedAt: now,
    risk: getRiskLevel(0),
    branch: payload.branch.trim(),
    category: payload.category.trim(),
    service: payload.service.trim(),
    description: payload.description.trim(),
    priority: null,
    assignedTech: null
  });

  return res.status(201).json({
    ok: true,
    message: 'Ticket creado correctamente.',
    data: enrichTicket(ticket)
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
    })),
    branch: payload.branch || null,
    category: payload.category || null,
    service: payload.service || null,
    description: payload.description || null,
    priority: payload.priority || null,
    assignedTech: payload.assignedTech || null
  };

  insertTicket(newTicket);

  return res.status(201).json({
    ok: true,
    message: 'Ticket externo integrado correctamente.',
    data: enrichTicket(newTicket)
  });
});

router.patch('/:id', authenticate, requireRole('executive'), (req, res) => {
  const ticket = getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });

  const { priority, status } = req.body || {};
  const validPriorities = ['Baja', 'Media', 'Alta'];
  const validStatuses = ['activo', 'pausado', 'resuelto', 'cerrado'];

  if (priority !== undefined && !validPriorities.includes(priority)) {
    return res.status(400).json({ ok: false, message: 'Selecciona una prioridad válida.' });
  }
  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ ok: false, message: 'Selecciona un estado válido.' });
  }
  if (priority === undefined && status === undefined) {
    return res.status(400).json({ ok: false, message: 'Indica la prioridad o el estado que deseas actualizar.' });
  }

  const updatedTicket = updateTicket(req.params.id, {
    priority: priority === undefined ? ticket.priority : priority,
    status: status === undefined ? ticket.status : status,
    assignedTech: ticket.assignedTech || req.user.name
  });

  return res.json({ ok: true, message: 'Ticket actualizado correctamente.', data: enrichTicket(updatedTicket) });
});

router.get('/:id', authenticate, (req, res) => {
  const ticket = getTicketById(req.params.id);

  if (!ticket || (req.user.role === 'client' && ticket.clientEmail.toLowerCase() !== req.user.email.toLowerCase())) {
    return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
  }

  return res.json({ ok: true, data: enrichTicket(ticket) });
});

router.post('/:id/send-critical-email', authenticate, requireRole('executive', 'admin'), async (req, res) => {
  const ticket = getTicketById(req.params.id);

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
