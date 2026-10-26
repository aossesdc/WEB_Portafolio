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

const tickets = [];

module.exports = {
  users,
  tickets
};
