import { Component, computed, inject, input, OnChanges, OnInit, output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { RealTicket, RealTicketRisk, RealTicketStatus, TicketCategoryOption, TicketClientOption, TicketPriority, TicketSupportOption } from '../core/models';
import { createTicketCsv, createTicketPdf, ReportTicket } from './ticket-report';

@Component({
  selector: 'app-real-tickets',
  imports: [FormsModule],
  templateUrl: './views/real-tickets.component.html',
  styleUrls: ['./views/real-tickets.css', './views/overview.css'],
})
export class RealTicketsComponent implements OnInit, OnChanges {
  readonly area = input.required<'client' | 'executive' | 'admin' | 'support'>();
  readonly view = input.required<'overview' | 'tickets' | 'new' | 'maintainers'>();
  readonly created = output<void>();
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly tickets = signal<RealTicket[]>([]);
  readonly categories = signal<TicketCategoryOption[]>([]);
  readonly clients = signal<TicketClientOption[]>([]);
  readonly personnel = signal<TicketSupportOption[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly notificationWarning = signal('');
  readonly editing = signal<RealTicket | null>(null);
  readonly selectedStatus = signal<RealTicketStatus | null>('Abierto');
  readonly selectedPriority = signal<TicketPriority | null>(null);
  readonly selectedRisk = signal<RealTicketRisk | null>(null);
  readonly selectedPerson = signal<number | null>(null);
  readonly selectedResolution = signal('');
  readonly categoriesLoading = signal(false);
  readonly categoryError = signal('');
  readonly executiveOptionsLoading = signal(false);
  readonly executiveOptionsError = signal('');
  readonly duplicateClientEmails = signal(false);
  readonly clientListOpen = signal(false);
  readonly activeClientIndex = signal(-1);
  title = '';
  description = '';
  categoryId: number | null = null;
  clientEmail = '';
  newStatus: RealTicketStatus | null = 'Abierto';
  newPriority: TicketPriority | null = null;
  newRisk: RealTicketRisk | null = null;
  newPersonId: number | null = null;
  readonly visibleTickets = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.tickets().filter((ticket) =>
      (this.area() !== 'executive' || this.view() !== 'overview' || (ticket.risk != null && ticket.status != null))
      &&
      (!this.statusFilter() || ticket.status === this.statusFilter())
      && (!term || `${ticket.code ?? ticket.id} ${ticket.title} ${ticket.client_name ?? ''} ${ticket.client_email ?? ''}`.toLocaleLowerCase('es').includes(term)));
  });
  readonly stats = computed(() => {
    const tickets = this.visibleTickets();
    return { total: tickets.length, open: tickets.filter((ticket) => ticket.status === 'Abierto').length,
      closed: tickets.filter((ticket) => ticket.status === 'Cerrado').length,
      critical: tickets.filter((ticket) => ticket.risk === 'Alto').length };
  });
  readonly riskCounts = computed(() => ({
    low: this.visibleTickets().filter((ticket) => ticket.risk === 'Bajo').length,
    medium: this.visibleTickets().filter((ticket) => ticket.risk === 'Medio').length,
    high: this.visibleTickets().filter((ticket) => ticket.risk === 'Alto').length,
    unevaluated: this.visibleTickets().filter((ticket) => ticket.risk == null).length,
  }));
  readonly pendingCount = computed(() => (this.area() === 'admin' ? this.visibleTickets() : this.tickets())
    .filter((ticket) => ticket.risk == null || ticket.status == null).length);
  readonly hasSelectedPerson = computed(() => this.personnel().some((person) => person.id === this.editing()?.support_person_id));

  ngOnInit(): void {
    void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['view'] && this.view() !== 'new') this.closeClientList();
    if (changes['view'] && this.area() === 'client' && this.view() === 'new') void this.loadCategories();
    if (changes['view'] && this.area() === 'executive' && this.view() === 'new') void this.loadExecutiveOptions();
  }

  filteredClients(): TicketClientOption[] {
    const term = this.clientEmail.trim().toLowerCase();
    return this.clients().filter((client) => client.email.toLowerCase().includes(term));
  }

  updateClientEmail(value: string): void {
    this.clientEmail = value;
    this.activeClientIndex.set(-1);
    this.clientListOpen.set(true);
  }

  closeClientList(): void {
    this.clientListOpen.set(false);
    this.activeClientIndex.set(-1);
  }

  toggleClientList(input: HTMLInputElement): void {
    const opening = !this.clientListOpen();
    input.focus();
    this.clientListOpen.set(opening);
    this.activeClientIndex.set(-1);
  }

  chooseClient(client: TicketClientOption): void {
    this.clientEmail = client.email;
    this.closeClientList();
  }

  clientListKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.clientListOpen()) {
        event.preventDefault();
        this.closeClientList();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.clientListOpen.set(true);
      const count = this.filteredClients().length;
      if (count) {
        const index = this.activeClientIndex();
        const nextIndex = event.key === 'ArrowDown'
          ? Math.min(index + 1, count - 1)
          : index < 0 ? count - 1 : Math.max(index - 1, 0);
        this.activeClientIndex.set(nextIndex);
        const clientId = this.filteredClients()[nextIndex].id;
        const document = (event.currentTarget as HTMLInputElement).ownerDocument;
        document.defaultView?.requestAnimationFrame(() => {
          if (this.clientListOpen() && this.filteredClients()[this.activeClientIndex()]?.id === clientId) {
            document.getElementById(`client-option-${clientId}`)?.scrollIntoView?.({ block: 'nearest' });
          }
        });
      }
      return;
    }
    if (event.key === 'Enter' && this.clientListOpen() && this.activeClientIndex() >= 0) {
      const client = this.filteredClients()[this.activeClientIndex()];
      if (client) {
        event.preventDefault();
        this.chooseClient(client);
      }
    }
  }

  private token(): string {
    const token = this.auth.token();
    if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
    return token;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(this.api.listTickets(this.token()));
      this.tickets.set(response.tickets);
      this.loaded.set(true);
    } catch (error) {
      this.loaded.set(false);
      if (this.area() === 'admin') this.tickets.set([]);
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los tickets.');
    } finally { this.loading.set(false); }
  }

  async loadCategories(): Promise<void> {
    if (this.categoriesLoading()) return;
    this.categoriesLoading.set(true);
    this.categoryError.set('');
    try {
      const response = await firstValueFrom(this.api.ticketCategories(this.token()));
      this.categories.set(response.categories);
    } catch (error) {
      this.categories.set([]);
      this.categoryError.set(error instanceof Error ? error.message : 'No se pudieron cargar las categorías.');
    } finally { this.categoriesLoading.set(false); }
  }

  async loadExecutiveOptions(): Promise<void> {
    if (this.executiveOptionsLoading()) return;
    this.executiveOptionsLoading.set(true);
    this.executiveOptionsError.set('');
    try {
      const response = await firstValueFrom(this.api.executiveTicketOptions(this.token()));
      this.categories.set(response.categories);
      this.clients.set(response.clients);
      this.duplicateClientEmails.set(response.duplicate_client_emails);
      this.personnel.set(response.personnel);
    } catch (error) {
      this.executiveOptionsError.set(error instanceof Error ? error.message : 'No se pudieron cargar las opciones del ticket.');
    } finally { this.executiveOptionsLoading.set(false); }
  }

  async createExecutive(): Promise<void> {
    if (this.saving() || this.executiveOptionsLoading() || this.executiveOptionsError()) return;
    const email = this.clientEmail.trim().toLowerCase();
    const matches = this.clients().filter((client) => client.email.trim().toLowerCase() === email);
    if (!this.title.trim() || !this.description.trim() || matches.length !== 1) {
      this.error.set('Completa el título y la descripción, y selecciona un correo de cliente único de la lista.');
      return;
    }
    if (this.newRisk !== null && !window.confirm('El riesgo se asigna una sola vez y no podrá modificarse. ¿Deseas continuar?')) return;
    this.saving.set(true);
    this.error.set('');
    this.notificationWarning.set('');
    try {
      const response = await firstValueFrom(this.api.createExecutiveTicket(this.token(), {
        title: this.title.trim(), description: this.description.trim(), client_id: matches[0].id,
        category_id: this.categoryId, status: this.newStatus, priority: this.newPriority,
        risk: this.newRisk, support_person_id: this.newPersonId,
      }));
      this.tickets.update((tickets) => [response.ticket, ...tickets]);
      this.title = '';
      this.description = '';
      this.categoryId = null;
      this.clientEmail = '';
      this.newStatus = 'Abierto';
      this.newPriority = null;
      this.newRisk = null;
      this.newPersonId = null;
      this.search.set('');
      this.statusFilter.set('');
      this.notice.set(`Ticket ${response.ticket.code ?? `#${response.ticket.id}`} creado correctamente.`);
      this.notificationWarning.set(response.notification_warning ?? '');
      this.created.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo crear el ticket.');
    } finally { this.saving.set(false); }
  }

  async create(): Promise<void> {
    if (this.saving()) return;
    if (!this.title.trim() || !this.description.trim() || this.categoryId === null) {
      this.error.set('Completa el título, la descripción y la categoría.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notificationWarning.set('');
    try {
      const response = await firstValueFrom(this.api.createTicket(this.token(), {
        title: this.title.trim(), description: this.description.trim(), category_id: this.categoryId,
      }));
      this.tickets.update((tickets) => [response.ticket, ...tickets]);
      this.title = '';
      this.description = '';
      this.categoryId = null;
      this.search.set('');
      this.statusFilter.set('');
      this.notice.set(`Ticket ${response.ticket.code ?? `#${response.ticket.id}`} creado correctamente.`);
      this.notificationWarning.set(response.notification_warning ?? '');
      this.created.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo crear el ticket.');
    } finally { this.saving.set(false); }
  }

  async openEdit(ticket: RealTicket): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    if (this.area() === 'support') {
      this.editing.set(ticket);
      this.selectedStatus.set(ticket.status);
      this.selectedResolution.set(ticket.resolution ?? '');
      return;
    }
    try {
      const response = await firstValueFrom(this.api.ticketPersonnel(this.token()));
      this.personnel.set(response.personnel);
      this.editing.set(ticket);
      this.selectedStatus.set(ticket.status);
      this.selectedPriority.set(ticket.priority ?? null);
      this.selectedRisk.set(ticket.risk ?? null);
      this.selectedPerson.set(ticket.support_person_id ?? null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el personal de soporte.');
    }
  }

  async saveEdit(): Promise<void> {
    const ticket = this.editing();
    if (!ticket || this.saving()) return;
    if (this.area() === 'support') {
      const status = this.selectedStatus();
      const resolution = this.selectedResolution().trim();
      if (ticket.status === 'Cerrado' && status === 'Abierto') {
        this.error.set('Soporte no puede reabrir un ticket cerrado; contacta al ejecutivo.');
        return;
      }
      if (ticket.status === 'Cerrado') {
        this.error.set('Soporte no puede modificar la solución de un ticket cerrado; contacta al ejecutivo.');
        return;
      }
      if (status === 'Cerrado' && !resolution) {
        this.error.set('Para cerrar el ticket, describe la solución.');
        return;
      }
      this.saving.set(true);
      this.error.set('');
      this.notificationWarning.set('');
      try {
        const response = await firstValueFrom(this.api.updateAssignedTicket(this.token(), ticket.id, {
          ...(status === null ? {} : { status }), resolution: resolution || null,
        }));
        this.tickets.update((tickets) => tickets.map((item) => item.id === ticket.id ? response.ticket : item));
        this.editing.set(null);
        this.notice.set('Ticket actualizado.');
        this.notificationWarning.set(response.notification_warning ?? '');
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el ticket.');
      } finally { this.saving.set(false); }
      return;
    }
    if (ticket.risk == null && this.selectedRisk() != null
      && !window.confirm('El riesgo se asigna una sola vez y no podrá modificarse. ¿Deseas continuar?')) return;
    this.saving.set(true);
    this.error.set('');
    this.notificationWarning.set('');
    try {
      const priority = this.selectedPriority();
      const risk = this.selectedRisk();
      const status = this.selectedStatus();
      const response = await firstValueFrom(this.api.updateTicket(this.token(), ticket.id, {
        ...(status === null ? {} : { status }), ...(priority === null ? {} : { priority }),
        ...(ticket.risk == null && risk !== null ? { risk } : {}),
        support_person_id: this.selectedPerson(),
      }));
      this.tickets.update((tickets) => tickets.map((item) => item.id === ticket.id ? response.ticket : item));
      this.editing.set(null);
      this.notice.set('Ticket actualizado.');
      this.notificationWarning.set(response.notification_warning ?? '');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el ticket.');
    } finally { this.saving.set(false); }
  }

  reportTickets(): ReportTicket[] {
    return this.visibleTickets().map((ticket) => ({
      code: ticket.code ?? `#${ticket.id}`, title: ticket.title,
      client: ticket.client_name ?? ticket.client_email ?? '', category: ticket.category_name ?? 'Sin categoría',
      priority: ticket.priority ?? 'Sin asignar', status: ticket.status ?? 'Sin asignar', risk: ticket.risk ?? 'Sin evaluar',
    }));
  }

  exportCsv(): void {
    let url: string | undefined;
    this.error.set('');
    try {
      url = URL.createObjectURL(new Blob([createTicketCsv(this.reportTickets())], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'reporte-tickets.csv';
      link.click();
    } catch (error) {
      console.error('Error al exportar CSV:', error);
      this.error.set('No se pudo exportar el archivo CSV.');
    } finally { if (url) URL.revokeObjectURL(url); }
  }

  async exportPdf(): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    this.saving.set(true);
    try {
      const pdf = await createTicketPdf(this.reportTickets(), this.stats(), true, false);
      pdf.save('reporte-tickets.pdf');
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      this.error.set('No se pudo exportar el archivo PDF.');
    } finally { this.saving.set(false); }
  }
}
