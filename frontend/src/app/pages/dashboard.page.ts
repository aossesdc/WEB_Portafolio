import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DisplayPreferencesComponent } from '../core/display-preferences.component';
import { UserRole } from '../core/models';
import { AccountsComponent } from './accounts.component';
import { HolidaysComponent } from './holidays.component';
import { BranchesComponent } from './branches.component';
import { CompaniesComponent } from './companies.component';
import { ContractsComponent } from './contracts.component';
import { ServiceTypesComponent } from './service-types.component';
import { HardwareCategoriesComponent } from './hardware-categories.component';
import { SupportPersonnelComponent } from './support-personnel.component';
import { RealTicketsComponent } from './real-tickets.component';
import { createTicketCsv, createTicketPdf } from './ticket-report';
import {
  DemoDataService,
  TicketRisk,
  TicketStatus,
} from '../core/demo-data.service';

type Area = 'client' | 'executive' | 'support' | 'admin';
type View = 'overview' | 'tickets' | 'new' | 'maintainers';

const AREA_LABELS: Record<Area, string> = {
  client: 'Cliente',
  executive: 'Ejecutivo',
  support: 'Soporte',
  admin: 'Administrador',
};

const AREA_VIEWS: Record<Area, View[]> = {
  client: ['overview', 'new'],
  executive: ['overview', 'tickets', 'new'],
  support: ['overview', 'tickets'],
  admin: ['overview', 'maintainers'],
};

const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Cliente',
  executive: 'Ejecutivo',
  soporte: 'Soporte',
  tech: 'Técnico',
  admin: 'Administrador',
};

const VIEW_LABELS: Record<View, string> = {
  overview: 'Resumen',
  tickets: 'Tickets',
  new: 'Crear ticket',
  maintainers: 'Módulos',
};

@Component({
  imports: [AccountsComponent, BranchesComponent, CompaniesComponent, ContractsComponent, ServiceTypesComponent, HardwareCategoriesComponent, SupportPersonnelComponent, RealTicketsComponent, HolidaysComponent, DisplayPreferencesComponent, NgTemplateOutlet, RouterLink],
  templateUrl: './views/dashboard.page.html',
  styleUrls: ['./views/dashboard.page.css', './views/maintainer-menu.css', './views/overview.css'],
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly data = inject(DemoDataService);

  readonly areas = Object.keys(AREA_LABELS) as Area[];
  readonly areaLabels = AREA_LABELS;
  readonly roleLabels = ROLE_LABELS;
  readonly viewLabels = VIEW_LABELS;
  readonly statuses: TicketStatus[] = ['Abierto', 'En progreso', 'Pausado', 'Resuelto', 'Cerrado'];

  readonly isPreview = this.route.snapshot.routeConfig?.path?.startsWith('preview') ?? false;
  readonly area = (this.route.snapshot.paramMap.get('area') as Area) ?? 'client';
  readonly usesRealTickets = !this.isPreview && (this.area === 'client' || this.area === 'executive' || this.area === 'support');
  readonly user = this.auth.user();
  readonly views = AREA_VIEWS[this.area] ?? AREA_VIEWS.client;
  readonly displayName = this.user?.name ?? `Usuario de ejemplo (${AREA_LABELS[this.area]})`;

  readonly view = signal<View>('overview');
  readonly maintainer = signal<'accounts' | 'holidays' | 'branches' | 'companies' | 'contracts' | 'service-types' | 'hardware-categories' | 'support-personnel' | null>(null);
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly message = signal('');
  readonly ticketFormError = signal('');
  readonly exportError = signal('');
  readonly exportingPdf = signal(false);

  readonly visibleTickets = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.data
      .tickets()
      .filter((t) => (this.area === 'client' ? t.client === 'Acme S.A.' : true))
      .filter((t) => !status || t.status === status)
      .filter((t) => !term || `${t.code} ${t.title} ${t.client}`.toLowerCase().includes(term));
  });

  readonly stats = computed(() => {
    const list = this.visibleTickets();
    const open = list.filter((t) => !['Resuelto', 'Cerrado'].includes(t.status)).length;
    return {
      total: list.length,
      open,
      critical: list.filter((t) => t.risk === 'Crítico').length,
      closed: list.length - open,
    };
  });

  readonly riskCounts = computed(() => {
    const counts = { low: 0, medium: 0, high: 0, unevaluated: 0 };
    for (const ticket of this.visibleTickets()) {
      switch (ticket.risk) {
        case 'Bajo': counts.low++; break;
        case 'Medio': counts.medium++; break;
        case 'Crítico': counts.high++; break;
        case 'Sin evaluar': counts.unevaluated++; break;
      }
    }
    return counts;
  });

  executiveRisk(risk: TicketRisk): string {
    return risk === 'Crítico' ? 'Alto' : risk;
  }

  selectView(view: View): void {
    this.maintainer.set(null);
    this.ticketFormError.set('');
    this.view.set(view);
  }

  setText(signalRef: { set(value: string): void }, event: Event): void {
    signalRef.set((event.target as HTMLInputElement).value);
  }

  createTicket(event: Event, title: string, description: string, category: string): void {
    event.preventDefault();
    if (!title.trim()) {
      this.ticketFormError.set('Escribe un título para el ticket.');
      return;
    }
    if (!description.trim()) {
      this.ticketFormError.set('Escribe una descripción para el ticket.');
      return;
    }
    if (category !== 'Hardware' && category !== 'Software') {
      this.ticketFormError.set('Selecciona una categoría válida.');
      return;
    }
    this.ticketFormError.set('');
    this.data.createTicket({ title: title.trim(), description: description.trim(), category }, 'Acme S.A.');
    this.message.set('Ticket de ejemplo creado (solo en memoria).');
    this.clearTicketFilters();
    this.view.set('overview');
  }

  changeStatus(id: number, event: Event): void {
    this.data.updateTicketStatus(id, (event.target as HTMLSelectElement).value as TicketStatus);
  }

  exportCsv(): void {
    this.exportError.set('');
    let url: string | undefined;
    try {
      const csv = createTicketCsv(this.visibleTickets());
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'reporte-tickets-demo.csv';
      link.click();
    } catch (error) {
      console.error('Error al exportar CSV:', error);
      this.exportError.set('No se pudo exportar el archivo CSV. Inténtalo nuevamente.');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.exportingPdf()) return;
    this.exportError.set('');
    this.exportingPdf.set(true);
    try {
      const pdf = await createTicketPdf(this.visibleTickets(), this.stats());
      pdf.save('reporte-tickets-demo.pdf');
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      this.exportError.set('No se pudo exportar el archivo PDF. Inténtalo nuevamente.');
    } finally {
      this.exportingPdf.set(false);
    }
  }

  clearTicketFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
  }

  goTo(area: Area): void {
    void this.router.navigate(['/preview', area]);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }
}
