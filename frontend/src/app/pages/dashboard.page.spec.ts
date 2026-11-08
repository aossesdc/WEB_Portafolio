import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { UserRole } from '../core/models';
import { DashboardPage } from './dashboard.page';
import { RealTicketsComponent } from './real-tickets.component';
import * as ticketReport from './ticket-report';

describe('DashboardPage maintainer menu', () => {
  async function setup(preview: boolean, area = 'admin', userRole?: UserRole) {
    const listAccounts = vi.fn().mockReturnValue(of({ ok: true, accounts: [] }));
    const logout = vi.fn();
    const listTickets = vi.fn().mockReturnValue(of({ ok: true, tickets: [] }));
    const ticketCategories = vi.fn().mockReturnValue(of({ ok: true, categories: [{ id: 3, name: 'Equipos' }] }));
    const createTicket = vi.fn().mockReturnValue(of({ ok: true, ticket: {
      id: 10, code: 'INC-10', title: 'Equipo', description: 'No inicia', category_id: 3,
      category_name: 'Equipos', status: 'Abierto',
    } }));
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: {
            routeConfig: { path: preview ? 'preview/:area' : 'dashboard/:area' },
            paramMap: convertToParamMap({ area }),
          } },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal(preview ? null : { id: 1, name: 'Usuario de prueba', email: 'usuario@example.com', role: userRole ?? (area === 'support' ? 'soporte' : area), profile: 'Usuario' }),
            token: () => 'admin-token',
            logout,
          },
        },
        { provide: ApiService, useValue: { listAccounts, listTickets, ticketCategories, createTicket } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const clickButton = (text: string) => {
      const button = Array.from(element.querySelectorAll('button'))
        .find((item) => item.textContent?.includes(text));
      expect(button).toBeDefined();
      button!.click();
      fixture.detectChanges();
    };
    return { fixture, element, clickButton, listAccounts, listTickets, createTicket, logout };
  }

  it.each([
    ['client', 'Cliente'],
    ['executive', 'Ejecutivo'],
    ['support', 'Soporte'],
    ['admin', 'Administrador'],
  ])('shows a non-interactive account card in the %s portal', async (area, role) => {
    const { element, logout } = await setup(false, area);
    const card = element.querySelector<HTMLElement>('.session-card');
    expect(card?.textContent).toContain('Usuario de prueba');
    expect(card?.textContent).toContain('usuario@example.com');
    expect(card?.querySelector('.session-card-role')?.textContent).toContain(role);
    expect(card?.querySelector('button, a, input')).toBeNull();
    card?.click();
    expect(logout).not.toHaveBeenCalled();
    (element.querySelector('.sidebar-bottom button') as HTMLButtonElement).click();
    expect(logout).toHaveBeenCalledOnce();
  });

  it.each([
    ['client', ['Crear ticket', 'Resumen']],
    ['executive', ['Tickets', 'Crear ticket', 'Resumen']],
    ['support', ['Tickets', 'Resumen']],
    ['admin', ['Módulos', 'Resumen']],
  ])('keeps the account card visible across the %s portal views', async (area, views) => {
    const { element, clickButton, logout } = await setup(false, area);
    for (const view of views) {
      clickButton(view);
      expect(element.querySelector('.session-card')?.textContent).toContain('usuario@example.com');
      expect(element.querySelector('.sidebar-bottom button')?.textContent).toContain('Cerrar sesión');
      expect(logout).not.toHaveBeenCalled();
    }
  });

  it('shows the actual role for a technician in the support portal', async () => {
    const { element } = await setup(false, 'support', 'tech');
    expect(element.querySelector('.session-card-role')?.textContent).toContain('Técnico');
  });

  it.each(['client', 'executive', 'support', 'admin'])(
    'returns to the %s overview without leaving the session',
    async (area) => {
      const { fixture, element, logout } = await setup(false, area);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      const page = fixture.componentInstance;
      expect(element.querySelector('.panel-actions button.button-quiet .home-icon')).not.toBeNull();
      page.selectView(area === 'admin' ? 'maintainers' : area === 'client' ? 'new' : 'tickets');
      fixture.detectChanges();

      (element.querySelector('.panel-actions button.button-quiet') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(page.view()).toBe('overview');
      expect(page.maintainer()).toBeNull();
      expect(logout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();

      page.selectView(area === 'admin' ? 'maintainers' : area === 'client' ? 'new' : 'tickets');
      (element.querySelector('.dashboard-home-brand') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(page.view()).toBe('overview');
      expect(logout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('keeps the public home links for previews', async () => {
    const { element } = await setup(true, 'client');
    expect(element.querySelector('.session-card')).toBeNull();
    expect(element.querySelector('.sidebar .brand')?.getAttribute('href')).toBe('/');
    expect(element.querySelector('.panel-actions a')?.getAttribute('href')).toBe('/');
    expect(element.querySelector('.panel-actions a .home-icon')).not.toBeNull();
  });

  it('uses the real ticket component for authenticated client and returns to summary after creation', async () => {
    const { fixture, element, clickButton, listTickets, createTicket } = await setup(false, 'client');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(listTickets).toHaveBeenCalledWith('admin-token');
    expect(element.querySelector('app-real-tickets')).not.toBeNull();
    clickButton('Crear ticket');
    await fixture.whenStable();
    fixture.detectChanges();
    const child: RealTicketsComponent = fixture.debugElement.query(By.directive(RealTicketsComponent)).componentInstance;
    child.title = 'Equipo';
    child.description = 'No inicia';
    child.categoryId = 3;
    await child.create();
    fixture.detectChanges();
    expect(createTicket).toHaveBeenCalled();
    expect(fixture.componentInstance.view()).toBe('overview');
    expect(element.textContent).toContain('INC-10');
    expect(element.textContent).not.toContain('INC-1001');
  });

  it('loads real tickets for the admin summary and preserves the modules menu', async () => {
    const { fixture, element, clickButton, listTickets } = await setup(false, 'admin');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(listTickets).toHaveBeenCalledWith('admin-token');
    expect(element.querySelector('app-real-tickets')).not.toBeNull();
    expect(element.textContent).not.toContain('Tickets: datos de demostración');
    clickButton('Módulos');
    expect(element.querySelector('app-real-tickets')).toBeNull();
    expect(element.textContent).toContain('Gestión de usuarios/cuentas');
    clickButton('Resumen');
    await fixture.whenStable();
    expect(listTickets).toHaveBeenCalledTimes(2);
  });

  it('keeps the admin preview on demonstration data', async () => {
    const { element, listTickets } = await setup(true, 'admin');
    expect(listTickets).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Tickets: datos de demostración');
  });

  it('does not request real tickets in the public executive preview', async () => {
    const { element, listTickets } = await setup(true, 'executive');
    expect(listTickets).not.toHaveBeenCalled();
    expect(element.querySelector('app-real-tickets')).toBeNull();
    expect(element.textContent).toContain('datos de demostración');
  });

  it('offers the executive creation tab in preview without creating real tickets', async () => {
    const { element, clickButton, createTicket, listTickets } = await setup(true, 'executive');
    clickButton('Crear ticket');
    expect(element.textContent).toContain('Para registrar un ticket real');
    expect(element.querySelector('form')).toBeNull();
    expect(createTicket).not.toHaveBeenCalled();
    expect(listTickets).not.toHaveBeenCalled();
  });

  it.each(['admin', 'executive'])('shows both exports in Resumen for %s without a Reportes tab', async (area) => {
    const { element, fixture } = await setup(true, area);
    const nav = Array.from(element.querySelectorAll('.sidebar .nav-item')).map((button) => button.textContent?.trim());
    expect(nav).toContain('Resumen');
    expect(nav).not.toContain('Reportes');
    expect(element.querySelectorAll('.stat-card')).toHaveLength(4);
    const exportButton = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Exportar CSV'));
    expect(exportButton).toBeDefined();
    const exportSpy = vi.spyOn(fixture.componentInstance, 'exportCsv').mockImplementation(() => {});
    exportButton!.click();
    expect(exportSpy).toHaveBeenCalledOnce();
    const pdfButton = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Exportar PDF'));
    expect(pdfButton).toBeDefined();
    const pdfSpy = vi.spyOn(fixture.componentInstance, 'exportPdf').mockResolvedValue();
    pdfButton!.click();
    expect(pdfSpy).toHaveBeenCalledOnce();
  });

  it('explains active filters and clears them for the overview', async () => {
    const { fixture, element, clickButton } = await setup(true, 'executive');
    fixture.componentInstance.search.set('INC-1001');
    fixture.componentInstance.statusFilter.set('En progreso');
    fixture.detectChanges();
    expect(element.textContent).toContain('filtros de tickets actuales');
    expect(fixture.componentInstance.visibleTickets()).toHaveLength(1);
    clickButton('Quitar filtros');
    expect(fixture.componentInstance.visibleTickets()).toHaveLength(5);
    expect(element.textContent).not.toContain('filtros de tickets actuales');
    clickButton('Tickets');
    expect((element.querySelector('.filter-row select') as HTMLSelectElement).value).toBe('');
  });

  it('shows the executive risk traffic light, including unevaluated tickets and active filters', async () => {
    const { fixture, element, clickButton } = await setup(true, 'executive');
    const component = fixture.componentInstance;
    component.data.createTicket({ title: 'Nueva incidencia', description: 'Revisión', category: 'Hardware' }, 'Acme S.A.');
    fixture.detectChanges();
    const count = (selector: string) => element.querySelector(`.risk-level.${selector} strong`)?.textContent?.trim();
    expect(count('risk-low')).toBe('2');
    expect(count('risk-medium')).toBe('2');
    expect(count('risk-high')).toBe('1');
    expect(count('risk-unevaluated')).toBe('1');
    expect(element.querySelector('.risk-indicator.risk-unevaluated')?.textContent).toContain('Sin evaluar');
    expect(element.querySelector('.risk-indicator.risk-high')?.textContent).toContain('Alto');
    expect(element.querySelector('.risk-indicator.risk-medium')?.textContent).toContain('Medio');
    expect(element.querySelector('.risk-indicator.risk-low')?.textContent).toContain('Bajo');
    expect(element.textContent).toContain('Crítico se muestra como Alto');
    component.statusFilter.set('En progreso');
    fixture.detectChanges();
    expect(count('risk-high')).toBe('1');
    expect(count('risk-low')).toBe('0');
    expect(count('risk-unevaluated')).toBe('0');
    component.search.set('no existe');
    fixture.detectChanges();
    expect(count('risk-high')).toBe('0');
    expect(count('risk-medium')).toBe('0');
    clickButton('Quitar filtros');
    expect(count('risk-unevaluated')).toBe('1');
    expect(component.data.tickets().find((ticket) => ticket.code === 'INC-1001')?.risk).toBe('Crítico');
  });

  it.each(['admin', 'support', 'client'])('does not show the executive risk dashboard to %s', async (area) => {
    const { element } = await setup(true, area);
    expect(element.querySelector('.risk-overview')).toBeNull();
    expect(element.querySelector('.risk-indicator')).toBeNull();
  });

  it('exports only the filtered tickets as a real PDF', async () => {
    const { fixture } = await setup(true, 'executive');
    fixture.componentInstance.search.set('INC-1001');
    const pdf = await ticketReport.createTicketPdf(fixture.componentInstance.visibleTickets(), fixture.componentInstance.stats());
    const output = pdf.output();
    expect(output.startsWith('%PDF-')).toBe(true);
    expect(output).toContain('INC-1001');
    expect(output).not.toContain('INC-1002');
    expect(output).toContain('Total: 1');
  });

  it.each([true])('shows all client tickets in Resumen with filters and no risk (preview: %s)', async (preview) => {
    const { fixture, element } = await setup(preview, 'client');
    const component = fixture.componentInstance;
    for (let i = 0; i < 5; i++) {
      component.data.createTicket({ title: `Solicitud ${i}`, description: 'Equipo sin conexión', category: 'Hardware' }, 'Acme S.A.');
    }
    fixture.detectChanges();
    const nav = Array.from(element.querySelectorAll('.sidebar > .nav-item')).map((button) => button.textContent?.trim());
    expect(nav).toEqual(['Resumen', 'Crear ticket']);
    expect(element.querySelectorAll('.stat-card')).toHaveLength(3);
    expect(element.textContent).not.toContain('Críticos');
    expect(element.querySelector('th')?.textContent).toContain('Código');
    expect(element.querySelectorAll('th')).toHaveLength(3);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(element.querySelector('.risk-pill')).toBeNull();
    expect(element.textContent).not.toContain('Riesgo');
    expect(element.textContent).not.toContain('Ver todos');
    const search = element.querySelector('.filter-row input') as HTMLInputElement;
    search.value = 'INC-1001';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    const status = element.querySelector('.filter-row select') as HTMLSelectElement;
    status.value = 'Cerrado';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(element.textContent).toContain('No hay tickets que coincidan');
    status.value = 'En progreso';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector('tbody')?.textContent).toContain('En progreso');
    expect(element.querySelector('tbody')?.textContent).not.toContain('Crítico');
  });

  it('returns to client summary after creating a ticket even with prior filters', async () => {
    const { fixture, element, clickButton } = await setup(true, 'client');
    const component = fixture.componentInstance;
    component.search.set('no coincide');
    component.statusFilter.set('Cerrado');
    clickButton('Crear ticket');
    component.createTicket(new Event('submit'), 'Nueva solicitud', 'No funciona el equipo', 'Hardware');
    fixture.detectChanges();
    expect(component.view()).toBe('overview');
    expect(component.search()).toBe('');
    expect(component.statusFilter()).toBe('');
    expect(element.textContent).toContain('Nueva solicitud');
    expect(element.textContent).toContain('No funciona el equipo');
    expect(element.textContent).toContain('Ticket de ejemplo creado');
  });

  it.each(['Hardware', 'Software'])('creates a demo %s ticket from the form without priority', async (categoryValue) => {
    const { fixture, element, clickButton } = await setup(true, 'client');
    clickButton('Crear ticket');
    const form = element.querySelector('form')!;
    const title = form.querySelector('input[name="title"]') as HTMLInputElement;
    const description = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    const category = form.querySelector('select[name="category"]') as HTMLSelectElement;
    expect(title.required).toBe(true);
    expect(description.required).toBe(true);
    expect(category.required).toBe(true);
    expect(Array.from(category.options).map((option) => option.value)).toEqual(['', 'Hardware', 'Software']);
    expect(Array.from(category.options).map((option) => option.textContent?.trim()))
      .toEqual(['Selecciona una categoría', 'Hardware (físico)', 'Software (aplicaciones)']);
    expect(form.textContent).not.toContain('Prioridad');
    title.value = '  No inicia  ';
    description.value = '  Pantalla sin imagen  ';
    category.value = categoryValue;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.view()).toBe('overview');
    expect(fixture.componentInstance.data.tickets()[0]).toMatchObject({
      title: 'No inicia', description: 'Pantalla sin imagen', category: categoryValue,
      priority: 'Sin asignar', risk: 'Sin evaluar', status: 'Abierto',
    });
    expect(element.querySelector('details')?.textContent).toContain('Pantalla sin imagen');
  });

  it('rejects blank fields and invalid category without leaving the form', async () => {
    const { fixture, element, clickButton } = await setup(true, 'client');
    clickButton('Crear ticket');
    const component = fixture.componentInstance;
    const before = component.data.tickets().length;
    for (const [title, description, category, expected] of [
      [' ', 'Descripción', 'Hardware', 'título'],
      ['Título', '  ', 'Hardware', 'descripción'],
      ['Título', 'Descripción', '', 'categoría'],
      ['Título', 'Descripción', 'Otros', 'categoría'],
    ]) {
      component.createTicket(new Event('submit', { cancelable: true }), title, description, category);
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(expected);
      expect(component.data.tickets()).toHaveLength(before);
      expect(component.view()).toBe('new');
    }
  });

  it('uses real assigned tickets and risk overview for support', async () => {
    const { fixture, element, clickButton } = await setup(false, 'support');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-real-tickets')).not.toBeNull();
    expect(element.textContent).toContain('Semáforo de riesgos');
    clickButton('Tickets');
    expect(fixture.componentInstance.view()).toBe('tickets');
    expect(element.textContent).not.toContain('INC-1001');
  });

  it('hides risk and due columns from the executive tickets list', async () => {
    const { element, clickButton } = await setup(true, 'executive');
    clickButton('Tickets');
    const headers = Array.from(element.querySelectorAll('thead th')).map((header) => header.textContent?.trim());
    expect(headers).toEqual(['Código', 'Título', 'Cliente', 'Categoría', 'Prioridad', 'Estado']);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(5);
    for (const row of element.querySelectorAll('tbody tr')) {
      expect(row.querySelectorAll('td')).toHaveLength(headers.length);
    }
    expect(element.querySelector('.risk-pill')).toBeNull();
    expect(element.querySelector('tbody select')).not.toBeNull();
  });

  it('opens the account list from the tile and returns to the menu', async () => {
    const { fixture, element, clickButton, listAccounts } = await setup(false);
    clickButton('Módulos');
    expect(element.querySelector('.maintainer-tile')).not.toBeNull();
    expect(element.querySelector('app-accounts')).toBeNull();
    expect(listAccounts).not.toHaveBeenCalled();
    clickButton('Gestión de usuarios/cuentas');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-accounts')).not.toBeNull();
    expect(listAccounts).toHaveBeenCalledWith('admin-token');
    clickButton('Volver a módulos');
    expect(element.querySelector('app-accounts')).toBeNull();
    expect(element.querySelector('.maintainer-tile')).not.toBeNull();
  });

  it('keeps real accounts inaccessible in the preview', async () => {
    const { element, clickButton, listAccounts } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de usuarios/cuentas');
    expect(element.textContent).toContain('inicia sesión como administrador');
    expect(element.querySelector('app-accounts')).toBeNull();
    expect(listAccounts).not.toHaveBeenCalled();
    clickButton('Volver a módulos');
    expect(element.querySelector('.maintainer-tile')).not.toBeNull();
  });

  it('opens the holidays tile in the preview and can return', async () => {
    const { fixture, element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Feriados');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/holidays').flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-holidays')).not.toBeNull();
    clickButton('Volver a módulos');
    expect(element.querySelector('app-holidays')).toBeNull();
    http.verify();
  });

  it('does not access real branches in the preview', async () => {
    const { element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de sucursales');
    expect(element.querySelector('app-branches')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
    clickButton('Volver a módulos');
    expect(element.querySelector('app-branches')).toBeNull();
    expect(element.querySelector('.maintainer-tile')).not.toBeNull();
  });

  it('opens real branches for an administrator', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listBranches = vi.fn().mockReturnValue(of({ ok: true, branches: [] }));
    clickButton('Módulos');
    clickButton('Gestión de sucursales');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-branches')).not.toBeNull();
    expect(api.listBranches).toHaveBeenCalledWith('admin-token');
  });

  it('only opens real companies for an administrator', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listCompanies = vi.fn().mockReturnValue(of({ ok: true, companies: [] }));
    clickButton('Módulos');
    clickButton('Gestión de cuentas empresariales');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-companies')).not.toBeNull();
    expect(api.listCompanies).toHaveBeenCalledWith('admin-token');
  });

  it('does not access real companies in the preview', async () => {
    const { element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de cuentas empresariales');
    expect(element.querySelector('app-companies')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
  });

  it('opens real contracts for an administrator', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listContracts = vi.fn().mockReturnValue(of({ ok: true, contracts: [] }));
    clickButton('Módulos');
    clickButton('Gestión de contratos');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-contracts')).not.toBeNull();
    expect(api.listContracts).toHaveBeenCalledWith('admin-token');
  });

  it('does not access real contracts in the preview', async () => {
    const { element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de contratos');
    expect(element.querySelector('app-contracts')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
  });

  it('opens service types for an administrator', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listServiceTypes = vi.fn().mockReturnValue(of({ ok: true, service_types: [] }));
    clickButton('Módulos');
    clickButton('Gestión de tipos de servicio');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-service-types')).not.toBeNull();
    expect(api.listServiceTypes).toHaveBeenCalledWith('admin-token');
    clickButton('Volver a módulos');
    expect(element.querySelector('app-service-types')).toBeNull();
  });

  it('does not access real service types in the preview', async () => {
    const { element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de tipos de servicio');
    expect(element.querySelector('app-service-types')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
  });

  it('opens hardware categories for an administrator', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listHardwareCategories = vi.fn().mockReturnValue(of({ ok: true, categories: [] }));
    clickButton('Módulos');
    clickButton('Gestión de categorías de equipos');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-hardware-categories')).not.toBeNull();
    expect(api.listHardwareCategories).toHaveBeenCalledWith('admin-token');
    clickButton('Volver a módulos');
    expect(element.querySelector('app-hardware-categories')).toBeNull();
  });

  it('does not access real hardware categories in the preview', async () => {
    const { element, clickButton } = await setup(true);
    clickButton('Módulos');
    clickButton('Gestión de categorías de equipos');
    expect(element.querySelector('app-hardware-categories')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
  });

  it('opens the personnel catalogue for administrators', async () => {
    const { fixture, element, clickButton } = await setup(false);
    const api = TestBed.inject(ApiService);
    api.listSupportPersonnel = vi.fn().mockReturnValue(of({ ok: true, personnel: [] }));
    clickButton('Módulos');
    clickButton('Gestión de personal operativo');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-support-personnel')).not.toBeNull();
    expect(api.listSupportPersonnel).toHaveBeenCalledWith('admin-token');
    clickButton('Volver a módulos');
    expect(element.querySelector('app-support-personnel')).toBeNull();
  });

  it('does not access real personnel in the preview', async () => {
    const { element, clickButton } = await setup(true);
    const api = TestBed.inject(ApiService);
    api.listSupportPersonnel = vi.fn();
    clickButton('Módulos');
    clickButton('Gestión de personal operativo');
    expect(element.querySelector('app-support-personnel')).toBeNull();
    expect(element.textContent).toContain('inicia sesión como administrador');
    expect(api.listSupportPersonnel).not.toHaveBeenCalled();
  });
});
