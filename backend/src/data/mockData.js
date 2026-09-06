const users = [
  {
    id: 1,
    name: 'Administrador General',
    email: 'admin@empresa.cl',
    password: 'Admin123',
    profile: 'Administrador',
    role: 'admin'
  },
  {
    id: 2,
    name: 'Carlos Medina',
    email: 'cliente@empresa.cl',
    password: 'Cliente123',
    profile: 'Cliente corporativo',
    role: 'client'
  },
  {
    id: 3,
    name: 'Ana Torres',
    email: 'ejecutivo.trabajo@empresa.cl',
    password: 'Trabajo123',
    profile: 'Ejecutivo de trabajo',
    role: 'executive'
  },
  {
    id: 4,
    name: 'Luisa Gómez',
    email: 'ejecutivo.soporte@empresa.cl',
    password: 'Soporte123',
    profile: 'Ejecutivo de soluciones y soporte',
    role: 'executive'
  }
];

const tickets = [
  {
    id: 'INC-2048',
    client: 'Banco Norte',
    clientEmail: 'cliente@empresa.cl',
    contractHours: 40,
    elapsedHours: 36,
    pausedHours: 2,
    status: 'activo',
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-29T02:00:00Z',
    risk: 'crítico'
  },
  {
    id: 'REQ-1103',
    client: 'Retail Max',
    clientEmail: 'cliente@empresa.cl',
    contractHours: 48,
    elapsedHours: 32,
    pausedHours: 5,
    status: 'activo',
    createdAt: '2026-08-12T10:00:00Z',
    updatedAt: '2026-08-29T01:00:00Z',
    risk: 'medio'
  },
  {
    id: 'SO-3341',
    client: 'Grupo Norte',
    clientEmail: 'cliente@empresa.cl',
    contractHours: 30,
    elapsedHours: 27,
    pausedHours: 1,
    status: 'activo',
    createdAt: '2026-08-18T08:30:00Z',
    updatedAt: '2026-08-29T00:30:00Z',
    risk: 'crítico'
  },
  {
    id: 'INC-2041',
    client: 'Codeline',
    clientEmail: 'cliente@empresa.cl',
    contractHours: 50,
    elapsedHours: 21,
    pausedHours: 3,
    status: 'resuelto',
    createdAt: '2026-08-01T12:00:00Z',
    updatedAt: '2026-08-15T16:00:00Z',
    risk: 'bajo'
  }
];

module.exports = {
  users,
  tickets
};
