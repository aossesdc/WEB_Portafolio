const express = require('express');
const {
  createMaintainerRecord,
  deleteMaintainerRecord,
  getMaintainerRecord,
  listMaintainerRecords,
  updateMaintainerRecord
} = require('../data/database');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

const definitions = {
  usuarios: [
    { label: 'Nombre completo' },
    { label: 'Correo', type: 'email' },
    { label: 'Perfil', options: ['Administrador', 'Ejecutivo', 'Cliente', 'Operador'] },
    { label: 'Estado', options: ['Activo', 'Inactivo', 'Pendiente'] }
  ],
  roles: [
    { label: 'Nombre del rol' },
    { label: 'Nivel', options: ['Nivel 1', 'Nivel 2', 'Nivel 3'] },
    { label: 'Permisos' },
    { label: 'Estado', options: ['Activo', 'Inactivo'] }
  ],
  clientes: [
    { label: 'Empresa' },
    { label: 'RUT' },
    { label: 'Contacto' },
    { label: 'Estado', options: ['Activo', 'Inactivo'] }
  ],
  contratos: [
    { label: 'Código' },
    { label: 'Cliente' },
    { label: 'Vigencia' },
    { label: 'Estado', options: ['Vigente', 'Por vencer', 'Suspendido'] }
  ],
  sla: [
    { label: 'Regla' },
    { label: 'Máximo' },
    { label: 'Multa' },
    { label: 'Estado', options: ['Activo', 'Inactivo'] }
  ],
  servicios: [
    { label: 'Tipo de servicio' },
    { label: 'Categoría' },
    { label: 'Tiempo estimado' },
    { label: 'Estado', options: ['Activo', 'Inactivo'] }
  ],
  hardware: [
    { label: 'Categoría' },
    { label: 'Marca' },
    { label: 'Modelo' },
    { label: 'Estado', options: ['Activo', 'Mantenimiento', 'Baja'] }
  ],
  sucursales: [
    { label: 'Sucursal' },
    { label: 'Ciudad' },
    { label: 'Encargado' },
    { label: 'Estado', options: ['Operativa', 'Cerrada'] }
  ],
  tecnicos: [
    { label: 'Nombre' },
    { label: 'Especialidad' },
    { label: 'Turno', options: ['Mañana', 'Tarde', 'Noche'] },
    { label: 'Estado', options: ['Disponible', 'Ocupado', 'Licencia'] }
  ],
  feriados: [
    { label: 'Fecha', type: 'date' },
    { label: 'Evento' },
    { label: 'Tipo', options: ['Feriado', 'Día inhábil', 'Suspendido'] },
    { label: 'Región' }
  ]
};

function normalizeRecord(moduleKey, data) {
  const fields = definitions[moduleKey];
  if (!fields || !data || typeof data !== 'object' || Array.isArray(data)) return null;

  const allowedLabels = new Set(fields.map(field => field.label));
  if (Object.keys(data).some(label => !allowedLabels.has(label))) return null;

  const normalized = {};
  for (const field of fields) {
    const value = typeof data[field.label] === 'string' ? data[field.label].trim() : '';
    if (!value || value.length > 500) return null;
    if (field.options && !field.options.includes(value)) return null;
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    normalized[field.label] = value;
  }
  return normalized;
}

function validateModule(req, res, next) {
  if (!definitions[req.params.moduleKey]) {
    return res.status(404).json({ ok: false, message: 'Mantenedor no encontrado.' });
  }
  next();
}

router.use(authenticate, requireRole('admin'));

router.get('/:moduleKey', validateModule, (req, res) => {
  return res.json({ ok: true, data: listMaintainerRecords(req.params.moduleKey) });
});

router.post('/:moduleKey', validateModule, (req, res) => {
  const data = normalizeRecord(req.params.moduleKey, req.body && req.body.data);
  if (!data) {
    return res.status(400).json({ ok: false, message: 'Completa los campos del mantenedor con valores válidos.' });
  }
  return res.status(201).json({
    ok: true,
    message: 'Registro creado correctamente.',
    data: createMaintainerRecord(req.params.moduleKey, data)
  });
});

router.put('/:moduleKey/:id', validateModule, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, message: 'Identificador de registro inválido.' });
  }
  if (!getMaintainerRecord(id, req.params.moduleKey)) {
    return res.status(404).json({ ok: false, message: 'Registro no encontrado.' });
  }
  const data = normalizeRecord(req.params.moduleKey, req.body && req.body.data);
  if (!data) {
    return res.status(400).json({ ok: false, message: 'Completa los campos del mantenedor con valores válidos.' });
  }
  return res.json({
    ok: true,
    message: 'Registro actualizado correctamente.',
    data: updateMaintainerRecord(id, req.params.moduleKey, data)
  });
});

router.delete('/:moduleKey/:id', validateModule, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, message: 'Identificador de registro inválido.' });
  }
  if (!deleteMaintainerRecord(id, req.params.moduleKey)) {
    return res.status(404).json({ ok: false, message: 'Registro no encontrado.' });
  }
  return res.json({ ok: true, message: 'Registro eliminado correctamente.' });
});

module.exports = router;
