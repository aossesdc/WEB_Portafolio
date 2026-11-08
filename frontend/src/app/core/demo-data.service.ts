import { Injectable, signal } from '@angular/core';

export type TicketStatus = 'Abierto' | 'En progreso' | 'Pausado' | 'Resuelto' | 'Cerrado';
export type TicketRisk = 'Bajo' | 'Medio' | 'Crítico' | 'Sin evaluar';
export type TicketCategory = 'Hardware' | 'Software';

export interface DemoTicket {
  id: number;
  code: string;
  title: string;
  description?: string;
  client: string;
  category: string;
  priority: string;
  status: TicketStatus;
  risk: TicketRisk;
  assignee: string;
  dueIn: string;
}

export interface DemoRecord {
  id: number;
  name: string;
  description: string;
  active: boolean;
}

export const MAINTAINER_MODULES = ['Categorías', 'Prioridades', 'Estados', 'Contratos'] as const;
export type MaintainerModule = (typeof MAINTAINER_MODULES)[number];

// Datos ficticios en memoria: no se escribe nada en PostgreSQL.
@Injectable({ providedIn: 'root' })
export class DemoDataService {
  private nextTicket = 1006;
  private nextRecord = 100;

  readonly tickets = signal<DemoTicket[]>([
    { id: 1, code: 'INC-1001', title: 'Caída del servicio de correo', client: 'Acme S.A.', category: 'Infraestructura', priority: 'Alta', status: 'En progreso', risk: 'Crítico', assignee: 'Soporte N2', dueIn: '2 h' },
    { id: 2, code: 'INC-1002', title: 'Error al emitir facturas', client: 'Logística Sur', category: 'Aplicaciones', priority: 'Media', status: 'Abierto', risk: 'Medio', assignee: 'Sin asignar', dueIn: '6 h' },
    { id: 3, code: 'INC-1003', title: 'Solicitud de nuevo usuario VPN', client: 'Acme S.A.', category: 'Accesos', priority: 'Baja', status: 'Resuelto', risk: 'Bajo', assignee: 'Soporte N1', dueIn: '—' },
    { id: 4, code: 'INC-1004', title: 'Lentitud en el ERP', client: 'Retail Norte', category: 'Aplicaciones', priority: 'Alta', status: 'Pausado', risk: 'Medio', assignee: 'Soporte N2', dueIn: '12 h' },
    { id: 5, code: 'INC-1005', title: 'Cambio de contraseña bloqueado', client: 'Retail Norte', category: 'Accesos', priority: 'Baja', status: 'Cerrado', risk: 'Bajo', assignee: 'Soporte N1', dueIn: '—' },
  ]);

  readonly records = signal<Record<MaintainerModule, DemoRecord[]>>({
    Categorías: [
      { id: 1, name: 'Infraestructura', description: 'Servidores, redes y correo', active: true },
      { id: 2, name: 'Aplicaciones', description: 'Software de negocio', active: true },
      { id: 3, name: 'Accesos', description: 'Usuarios y permisos', active: true },
    ],
    Prioridades: [
      { id: 4, name: 'Alta', description: 'Respuesta en 2 horas', active: true },
      { id: 5, name: 'Media', description: 'Respuesta en 8 horas', active: true },
      { id: 6, name: 'Baja', description: 'Respuesta en 24 horas', active: true },
    ],
    Estados: [
      { id: 7, name: 'Abierto', description: 'Ticket recién creado', active: true },
      { id: 8, name: 'En progreso', description: 'En atención', active: true },
      { id: 9, name: 'Cerrado', description: 'Finalizado', active: true },
    ],
    Contratos: [
      { id: 10, name: 'Acme S.A. — Premium', description: 'SLA 24x7', active: true },
      { id: 11, name: 'Retail Norte — Estándar', description: 'SLA horario laboral', active: false },
    ],
  });

  createTicket(data: { title: string; description: string; category: TicketCategory }, client: string): void {
    const id = this.nextTicket++;
    this.tickets.update((list) => [
      { id, code: `INC-${id}`, ...data, client, status: 'Abierto', priority: 'Sin asignar',
        risk: 'Sin evaluar', assignee: 'Sin asignar', dueIn: 'Sin definir' },
      ...list,
    ]);
  }

  updateTicketStatus(id: number, status: TicketStatus): void {
    this.tickets.update((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  saveRecord(module: MaintainerModule, record: Omit<DemoRecord, 'id'>, id?: number): void {
    this.records.update((all) => {
      const list = id
        ? all[module].map((r) => (r.id === id ? { ...r, ...record } : r))
        : [...all[module], { ...record, id: this.nextRecord++ }];
      return { ...all, [module]: list };
    });
  }

  deleteRecord(module: MaintainerModule, id: number): void {
    this.records.update((all) => ({ ...all, [module]: all[module].filter((r) => r.id !== id) }));
  }
}
