import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { RealTicket } from '../core/models';
import { RealTicketsComponent } from './real-tickets.component';
import * as ticketReport from './ticket-report';

describe('RealTicketsComponent', () => {
  const ticket: RealTicket = {
    id: 8, code: 'INC-123', title: 'Equipo', description: 'No inicia', category_id: 3,
    category_name: 'Servidores', status: 'Abierto', client_name: 'Ana', client_email: 'ana@example.com',
    priority: 'Media', support_person_id: null, support_person_name: null,
  };
  let api: {
    listTickets: ReturnType<typeof vi.fn>;
    ticketCategories: ReturnType<typeof vi.fn>;
    ticketPersonnel: ReturnType<typeof vi.fn>;
    executiveTicketOptions: ReturnType<typeof vi.fn>;
    createTicket: ReturnType<typeof vi.fn>;
    createExecutiveTicket: ReturnType<typeof vi.fn>;
    updateTicket: ReturnType<typeof vi.fn>;
    updateAssignedTicket: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listTickets: vi.fn().mockReturnValue(of({ tickets: [ticket] })),
      ticketCategories: vi.fn().mockReturnValue(of({ categories: [{ id: 3, name: 'Servidores' }] })),
      ticketPersonnel: vi.fn().mockReturnValue(of({ personnel: [{ id: 4, name: 'Alex', branch_name: 'Centro', availability: 'Disponible', user_active: true }] })),
      executiveTicketOptions: vi.fn().mockReturnValue(of({ categories: [{ id: 3, name: 'Servidores' }],
        clients: [{ id: 7, name: 'Ana', email: 'ana@example.com' }],
        duplicate_client_emails: false,
        personnel: [{ id: 4, name: 'Alex', branch_name: 'Centro', availability: 'Disponible', user_active: true }] })),
      createTicket: vi.fn().mockReturnValue(of({ ticket })),
      createExecutiveTicket: vi.fn().mockReturnValue(of({ ticket: { ...ticket, risk: 'Alto' } })),
      updateTicket: vi.fn().mockReturnValue(of({ ticket: { ...ticket, status: 'Cerrado', priority: 'Alta', support_person_id: 4, support_person_name: 'Alex' } })),
      updateAssignedTicket: vi.fn().mockReturnValue(of({ ticket: { ...ticket, status: 'Cerrado', resolution: 'Reparado' } })),
    };
    await TestBed.configureTestingModule({
      imports: [RealTicketsComponent],
      providers: [{ provide: ApiService, useValue: api }, { provide: AuthService, useValue: { token: () => 'token' } }],
    }).compileComponents();
  });

  it('shows all admin tickets and exports the filtered real data without edit actions', async () => {
    api.listTickets.mockReturnValue(of({ tickets: [
      { ...ticket, id: 1, code: 'INC-1', title: 'Pendiente', status: null, risk: null },
      { ...ticket, id: 2, code: 'INC-2', title: 'Resuelto', status: 'Cerrado', risk: 'Alto' },
    ] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'admin');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    expect(api.listTickets).toHaveBeenCalledWith('token');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('Sin asignar');
    expect(root.textContent).toContain('Sin evaluar');
    expect(root.textContent).toContain('ana@example.com');
    expect(root.querySelector('button')?.textContent).not.toContain('Editar');
    expect(root.querySelector('thead')?.textContent).not.toContain('Acciones');
    expect(component.stats()).toEqual({ total: 2, open: 0, closed: 1, critical: 1 });
    expect(component.pendingCount()).toBe(1);
    component.statusFilter.set('Cerrado');
    fixture.detectChanges();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(component.pendingCount()).toBe(0);
    const createUrl = vi.fn().mockReturnValue('blob:test');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      component.exportCsv();
      expect(createUrl).toHaveBeenCalledOnce();
      const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(createUrl.mock.calls[0][0]);
      });
      expect(csv).toContain('"INC-2"');
      expect(csv).not.toContain('"INC-1"');
      const pdf = await ticketReport.createTicketPdf(component.reportTickets(), component.stats(), true, false);
      const pdfOutput = pdf.output();
      expect(pdfOutput).toContain('INC-2');
      expect(pdfOutput).not.toContain('INC-1');
      expect(pdfOutput).toContain('Tickets registrados');
      expect(pdfOutput).toContain('Total: 1');
    } finally {
      vi.unstubAllGlobals(); click.mockRestore();
    }
  });

  it('refreshes admin tickets manually and disables exports when refresh fails', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'admin');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    api.listTickets.mockReturnValueOnce(of({ tickets: [{ ...ticket, title: 'Actualizado' }] }));
    await fixture.componentInstance.load();
    expect(fixture.componentInstance.tickets()[0].title).toBe('Actualizado');
    api.listTickets.mockReturnValueOnce(throwError(() => new Error('Error de conexión')));
    await fixture.componentInstance.load();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Error de conexión');
    expect(root.textContent).not.toContain('Actualizado');
    expect(root.querySelector<HTMLButtonElement>('.export-csv')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('.export-pdf')?.disabled).toBe(true);
  });

  it('creates a client ticket with a real category and retains it in summary', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'client');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(api.listTickets).toHaveBeenCalledWith('token');
    expect(api.ticketCategories).toHaveBeenCalledWith('token');
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="category"]')?.textContent).toContain('Servidores');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Actualizar categorías');
    component.title = '  Equipo  ';
    component.description = ' No inicia ';
    component.categoryId = 3;
    const emit = vi.spyOn(component.created, 'emit');
    await component.create();
    expect(api.createTicket).toHaveBeenCalledWith('token', { title: 'Equipo', description: 'No inicia', category_id: 3 });
    expect(emit).toHaveBeenCalled();
    expect(component.tickets()[0].code).toBe('INC-123');
    expect(component.notice()).toContain('creado correctamente');
  });

  it('displays email failure separately from the successful ticket creation', async () => {
    api.createTicket.mockReturnValue(of({ ticket, notification_warning: 'El ticket se guardó, pero no se pudo enviar el correo.' }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'client');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.title = 'Equipo';
    component.description = 'No inicia';
    component.categoryId = 3;
    await component.create();
    fixture.detectChanges();
    expect(component.notice()).toContain('creado correctamente');
    expect(component.notificationWarning()).toContain('no se pudo enviar');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('no se pudo enviar');
  });

  it('creates a full ticket for an existing client and confirms risk', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(api.executiveTicketOptions).toHaveBeenCalledWith('token');
    const emailInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="client"]')!;
    expect(emailInput.getAttribute('role')).toBe('combobox');
    emailInput.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="option"]')?.textContent).toContain('ana@example.com');
    component.title = ' Equipo ';
    component.description = ' No inicia ';
    component.clientEmail = 'ANA@example.com';
    component.categoryId = 3;
    component.newStatus = 'Cerrado';
    component.newPriority = 'Crítica';
    component.newRisk = 'Alto';
    component.newPersonId = 4;
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const emit = vi.spyOn(component.created, 'emit');
    await component.createExecutive();
    expect(api.createExecutiveTicket).not.toHaveBeenCalled();
    await component.createExecutive();
    expect(api.createExecutiveTicket).toHaveBeenCalledWith('token', {
      title: 'Equipo', description: 'No inicia', client_id: 7, category_id: 3, status: 'Cerrado',
      priority: 'Crítica', risk: 'Alto', support_person_id: 4,
    });
    expect(emit).toHaveBeenCalledOnce();
    expect(component.tickets()[0].risk).toBe('Alto');
    expect(component.clientEmail).toBe('');
    confirmation.mockRestore();
  });

  it('keeps form data on failure and permits unassigned optional fields', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.title = 'Equipo';
    component.description = 'Falla';
    component.clientEmail = 'ana@example.com';
    component.newStatus = null;
    api.createExecutiveTicket.mockReturnValueOnce(throwError(() => new Error('Cliente no disponible')));
    await component.createExecutive();
    expect(api.createExecutiveTicket).toHaveBeenCalledWith('token', {
      title: 'Equipo', description: 'Falla', client_id: 7, category_id: null, status: null,
      priority: null, risk: null, support_person_id: null,
    });
    expect(component.error()).toBe('Cliente no disponible');
    expect(component.title).toBe('Equipo');
    expect(component.clientEmail).toBe('ana@example.com');
  });

  it('requires an exact unique email and never submits a stale or ambiguous selection', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.title = 'Equipo';
    component.description = 'Falla';
    component.clientEmail = 'ana@example.com';
    component.clientEmail = 'ana@';
    await component.createExecutive();
    expect(api.createExecutiveTicket).not.toHaveBeenCalled();
    expect(component.error()).toContain('correo de cliente único');
    component.clientEmail = 'ana@example.com';
    component.clients.update((clients) => [...clients, { id: 8, name: 'Otro', email: 'ANA@EXAMPLE.COM' }]);
    await component.createExecutive();
    expect(api.createExecutiveTicket).not.toHaveBeenCalled();
  });

  it('warns when duplicated client emails are omitted', async () => {
    api.executiveTicketOptions.mockReturnValueOnce(of({ categories: [], clients: [],
      duplicate_client_emails: true, personnel: [] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('correos repetidos');
    fixture.componentInstance.clientListOpen.set(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('filters visible client suggestions and supports keyboard selection and dismissal', async () => {
    api.executiveTicketOptions.mockReturnValue(of({ categories: [], clients: [
      { id: 7, name: 'Ana', email: 'ana@example.com' },
      { id: 8, name: 'Bruno', email: 'bruno@example.com' },
    ], duplicate_client_emails: false, personnel: [] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[name="client"]')!;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(2);
    input.value = 'BRU';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(root.querySelector('[role="option"]')?.textContent).toContain('Bruno');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toBe('client-option-8');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('bruno@example.com');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    input.value = 'sin coincidencia';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.textContent).toContain('No se encontraron clientes');
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });

  it('opens the client list with its button and selects an option by click', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.client-list-toggle')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="listbox"]')).not.toBeNull();
    root.querySelector<HTMLElement>('[role="option"]')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.clientEmail).toBe('ana@example.com');
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });
  it('shows and retries executive option failures', async () => {
    api.executiveTicketOptions.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin conexión');
    await fixture.componentInstance.loadExecutiveOptions();
    expect(fixture.componentInstance.executiveOptionsError()).toBe('');
    expect(fixture.componentInstance.clients()).toHaveLength(1);
  });

  it('edits executive status, priority, and assigned personnel', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await component.openEdit(ticket);
    component.selectedStatus.set('Cerrado');
    component.selectedPriority.set('Alta');
    component.selectedPerson.set(4);
    await component.saveEdit();
    expect(api.updateTicket).toHaveBeenCalledWith('token', 8, { status: 'Cerrado', priority: 'Alta', support_person_id: 4 });
    expect(component.tickets()[0].status).toBe('Cerrado');
    expect(component.editing()).toBeNull();
  });

  it('shows the edit form only in the executive tickets tab', async () => {
    api.listTickets.mockReturnValue(of({ tickets: [{ ...ticket, risk: 'Bajo' }] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.openEdit(ticket);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="priority"]')).not.toBeNull();

    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="priority"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Editar INC-123');
    expect((fixture.nativeElement as HTMLElement).querySelector('tbody button')).toBeNull();

    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="priority"]')).not.toBeNull();
  });

  it('shows all assigned support tickets and permits only state and solution editing', async () => {
    api.listTickets.mockReturnValue(of({ tickets: [
      { ...ticket, risk: null, resolution: null },
      { ...ticket, id: 9, risk: 'Alto', resolution: 'Corregido' },
    ] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'support');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    expect(component.visibleTickets()).toHaveLength(2);
    expect(component.riskCounts().unevaluated).toBe(1);
    expect(root.textContent).toContain('Sin evaluar');
    expect(root.textContent).toContain('Corregido');
    expect(root.querySelector('.export-pdf')).not.toBeNull();
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await component.openEdit(component.tickets()[0]);
    fixture.detectChanges();
    expect(api.ticketPersonnel).not.toHaveBeenCalled();
    expect(root.querySelector('textarea[name="resolution"]')).not.toBeNull();
    expect(root.querySelector('select[name="priority"]')).toBeNull();
    expect(root.querySelector('select[name="risk"]')).toBeNull();
    component.selectedStatus.set('Cerrado');
    await component.saveEdit();
    expect(component.error()).toContain('describe la solución');
    expect(api.updateAssignedTicket).not.toHaveBeenCalled();
    component.selectedResolution.set(' Reparado ');
    await component.saveEdit();
    expect(api.updateAssignedTicket).toHaveBeenCalledWith('token', 8, { status: 'Cerrado', resolution: 'Reparado' });
    expect(component.tickets()[0].resolution).toBe('Reparado');
  });

  it('preserves support edits and displays an error if assignment changed', async () => {
    api.updateAssignedTicket.mockReturnValueOnce(throwError(() => new Error('El ticket no existe.')));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'support');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await component.openEdit(ticket);
    component.selectedResolution.set('Revisado');
    await component.saveEdit();
    expect(component.error()).toBe('El ticket no existe.');
    expect(component.selectedResolution()).toBe('Revisado');
    expect(component.editing()).toEqual(ticket);
  });

  it('prevents support reopening or changing the solution of a closed ticket', async () => {
    const closed: RealTicket = { ...ticket, status: 'Cerrado', resolution: 'Reparado' };
    api.listTickets.mockReturnValue(of({ tickets: [closed] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'support');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('tbody button')).toBeNull();
    expect(root.textContent).toContain('Ticket cerrado');
    await component.openEdit(closed);
    fixture.detectChanges();
    expect(root.querySelector<HTMLOptionElement>('select[name="status"] option[value="Abierto"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLTextAreaElement>('textarea[name="resolution"]')?.readOnly).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(root.textContent).toContain('el ejecutivo puede reabrirlo');
    component.selectedStatus.set('Abierto');
    await component.saveEdit();
    expect(api.updateAssignedTicket).not.toHaveBeenCalled();
    expect(component.error()).toContain('no puede reabrir');
    component.selectedStatus.set('Cerrado');
    component.selectedResolution.set('Reparación detallada');
    await component.saveEdit();
    expect(api.updateAssignedTicket).not.toHaveBeenCalled();
    expect(component.error()).toContain('no puede modificar la solución');
  });

  it('displays unassigned priority and preserves it when editing another field', async () => {
    const unassigned: RealTicket = { ...ticket, priority: null };
    api.listTickets.mockReturnValue(of({ tickets: [unassigned] }));
    api.updateTicket.mockReturnValue(of({ ticket: { ...unassigned, status: 'Cerrado' } }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('tbody')?.textContent).toContain('Sin asignar');
    const component = fixture.componentInstance;
    await component.openEdit(unassigned);
    fixture.detectChanges();
    expect(component.selectedPriority()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="priority"]')?.textContent).toContain('Sin asignar');
    component.selectedStatus.set('Cerrado');
    await component.saveEdit();
    expect(api.updateTicket).toHaveBeenCalledWith('token', 8, { status: 'Cerrado', support_person_id: null });
    expect(component.tickets()[0].priority).toBeNull();
  });

  it('loads categories on entering the form and retries after a failure when reopening it', async () => {
    api.ticketCategories.mockReturnValueOnce(throwError(() => new Error('No hay conexión')));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'client');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.ticketCategories).not.toHaveBeenCalled();
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No hay conexión');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.ticketCategories).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="category"]')?.textContent).toContain('Servidores');
    expect(fixture.componentInstance.categoryError()).toBe('');
  });

  it('surfaces failures without losing data or falsely showing successful counts', async () => {
    api.listTickets.mockReturnValueOnce(throwError(() => new Error('Base no disponible')));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('Base no disponible');
    expect((fixture.nativeElement as HTMLElement).querySelector('.stat-grid')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.export-csv')?.disabled).toBe(true);
    api.ticketPersonnel.mockReturnValueOnce(throwError(() => new Error('Sin personal')));
    await fixture.componentInstance.openEdit(ticket);
    expect(fixture.componentInstance.editing()).toBeNull();
    expect(fixture.componentInstance.error()).toBe('Sin personal');
  });

  it('keeps form data when creating fails', async () => {
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'client');
    fixture.componentRef.setInput('view', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.title = 'Equipo';
    component.description = 'Falla';
    component.categoryId = 3;
    api.createTicket.mockReturnValueOnce(throwError(() => new Error('Categoría inactiva')));
    await component.create();
    expect(component.error()).toBe('Categoría inactiva');
    expect(component.title).toBe('Equipo');
    expect(component.categoryId).toBe(3);
  });

  it('shows only assessed executive tickets with status in overview and counts risks after filters', async () => {
    api.listTickets.mockReturnValue(of({ tickets: [
      { ...ticket, id: 1, title: 'Bajo', risk: 'Bajo' },
      { ...ticket, id: 2, title: 'Medio', risk: 'Medio', status: 'Cerrado' },
      { ...ticket, id: 3, title: 'Alto', risk: 'Alto' },
      { ...ticket, id: 4, title: 'Pendiente', risk: null },
      { ...ticket, id: 5, title: 'Sin estado', risk: 'Alto', status: null, category_name: null },
    ] }));
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.visibleTickets().map((item) => item.id)).toEqual([1, 2, 3]);
    expect(component.riskCounts()).toEqual({ low: 1, medium: 1, high: 1, unevaluated: 0 });
    expect(component.pendingCount()).toBe(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('tbody')?.textContent).not.toContain('Pendiente');
    component.statusFilter.set('Cerrado');
    expect(component.riskCounts()).toEqual({ low: 0, medium: 1, high: 0, unevaluated: 0 });
    fixture.componentRef.setInput('view', 'tickets');
    component.statusFilter.set('');
    fixture.detectChanges();
    expect(component.visibleTickets()).toHaveLength(5);
    expect((fixture.nativeElement as HTMLElement).querySelector('thead')?.textContent).not.toContain('Riesgo');
    fixture.componentRef.setInput('area', 'client');
    fixture.componentRef.setInput('view', 'overview');
    fixture.detectChanges();
    expect(component.visibleTickets()).toHaveLength(5);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Semáforo');
  });

  it('confirms one-time risk assignment, then prevents editing it again', async () => {
    const unassigned: RealTicket = { ...ticket, risk: null };
    const assigned: RealTicket = { ...ticket, risk: 'Alto' };
    api.listTickets.mockReturnValue(of({ tickets: [unassigned] }));
    api.updateTicket.mockReturnValue(of({ ticket: assigned }));
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await component.openEdit(unassigned);
    component.selectedRisk.set('Alto');
    await component.saveEdit();
    expect(api.updateTicket).not.toHaveBeenCalled();
    await component.saveEdit();
    expect(api.updateTicket).toHaveBeenCalledWith('token', 8,
      { status: 'Abierto', priority: 'Media', risk: 'Alto', support_person_id: null });
    await component.openEdit(assigned);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="risk"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('no modificable');
    await component.saveEdit();
    expect(api.updateTicket).toHaveBeenLastCalledWith('token', 8,
      { status: 'Abierto', priority: 'Media', support_person_id: null });
    confirmation.mockRestore();
  });

  it('keeps the form open and reports a conflicting risk assignment', async () => {
    const unassigned: RealTicket = { ...ticket, risk: null };
    api.updateTicket.mockReturnValueOnce(throwError(() => new Error('El riesgo ya fue asignado y no se puede modificar.')));
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = TestBed.createComponent(RealTicketsComponent);
    fixture.componentRef.setInput('area', 'executive');
    fixture.componentRef.setInput('view', 'tickets');
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await component.openEdit(unassigned);
    component.selectedRisk.set('Medio');
    await component.saveEdit();
    expect(component.error()).toContain('El riesgo ya fue asignado');
    expect(component.editing()).toEqual(unassigned);
    expect(component.selectedRisk()).toBe('Medio');
    confirmation.mockRestore();
  });
});
