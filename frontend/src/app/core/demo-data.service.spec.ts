import { TestBed } from '@angular/core/testing';
import { DemoDataService } from './demo-data.service';

describe('DemoDataService', () => {
  it('crea tickets y edita registros solo en memoria', () => {
    const service = TestBed.inject(DemoDataService);
    const before = service.tickets().length;
    service.createTicket({ title: 'Prueba', description: 'No inicia el equipo', category: 'Hardware' }, 'Acme S.A.');
    expect(service.tickets().length).toBe(before + 1);
    expect(service.tickets()[0]).toMatchObject({ description: 'No inicia el equipo', category: 'Hardware',
      priority: 'Sin asignar', risk: 'Sin evaluar', dueIn: 'Sin definir', status: 'Abierto' });

    service.saveRecord('Categorías', { name: 'Nueva', description: '', active: true });
    const created = service.records()['Categorías'].find((r) => r.name === 'Nueva')!;
    service.deleteRecord('Categorías', created.id);
    expect(service.records()['Categorías'].some((r) => r.id === created.id)).toBe(false);
  });
});
