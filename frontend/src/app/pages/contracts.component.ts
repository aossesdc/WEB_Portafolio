import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Company, Contract, ContractCoverage, ContractDetails, ContractStatus, ServiceType } from '../core/models';

@Component({
  selector: 'app-contracts',
  imports: [FormsModule],
  templateUrl: './views/contracts.component.html',
  styleUrls: ['./views/accounts.component.css', './views/contracts.component.css'],
})
export class ContractsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly contracts = signal<Contract[]>([]);
  readonly companies = signal<Company[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Contract | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filteredContracts = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.contracts().filter((contract) =>
      [contract.code ?? '', contract.company_name, contract.service_type_name ?? '', contract.coverage, contract.status]
        .some((value) => value.toLocaleLowerCase('es').includes(term)));
  });
  companyId: number | null = null;
  serviceTypeId: number | null = null;
  description = '';
  startDate = '';
  endDate = '';
  coverage: ContractCoverage = '8x5';
  amount = '0.00';
  status: ContractStatus = 'Activo';

  get descriptionLetterCount(): number {
    return (this.description.normalize('NFC').match(/\p{L}/gu) ?? []).length;
  }

  readonly serviceTypeMatchesSelection = (service: ServiceType): boolean => service.id === this.serviceTypeId;

  ngOnInit(): void { void this.load(); }

  private token(): string {
    const token = this.auth.token();
    if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
    return token;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(this.api.listContracts(this.token()));
      this.contracts.set(response.contracts);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los contratos.');
    } finally { this.loading.set(false); }
  }

  async open(contract: Contract | null): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const token = this.token();
      const response = await firstValueFrom(forkJoin({
        companies: this.api.listCompanies(token),
        services: this.api.listServiceTypes(token),
      }));
      this.companies.set(response.companies.companies);
      this.serviceTypes.set(response.services.service_types);
      this.editing.set(contract);
      this.companyId = contract?.company_id ?? null;
      this.serviceTypeId = contract?.service_type_id ?? null;
      this.description = contract?.description ?? '';
      this.startDate = contract?.start_date ?? '';
      this.endDate = contract?.end_date ?? '';
      this.coverage = contract?.coverage ?? '8x5';
      this.amount = contract?.amount ?? '0.00';
      this.status = contract?.status ?? 'Activo';
      this.formOpen.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las empresas y los tipos de servicio.');
    } finally { this.loading.set(false); }
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (this.loading()) return;
    if (this.descriptionLetterCount < 15) {
      this.error.set('La descripción debe contener al menos 15 letras; los espacios, números y signos no cuentan.');
      return;
    }
    if (form.invalid) return;
    if (this.companyId === null || !this.startDate || !this.endDate || this.endDate <= this.startDate) {
      this.error.set('Selecciona una empresa y una fecha de término posterior a la fecha de inicio.');
      return;
    }
    const details: ContractDetails = {
      company_id: this.companyId, service_type_id: this.serviceTypeId, description: this.description,
      start_date: this.startDate, end_date: this.endDate,
      coverage: this.coverage, amount: this.amount.trim(), status: this.status,
    };
    const editing = this.editing();
    this.loading.set(true);
    this.error.set('');
    try {
      if (editing) await firstValueFrom(this.api.updateContract(this.token(), editing.id, details));
      else await firstValueFrom(this.api.createContract(this.token(), details));
      this.cancel();
      this.notice.set(editing ? 'Contrato actualizado.' : 'Contrato registrado.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el contrato.');
    } finally { this.loading.set(false); }
  }

  async changeStatus(contract: Contract): Promise<void> {
    if (this.loading()) return;
    const status: ContractStatus = contract.status === 'Activo' ? 'Suspendido' : 'Activo';
    const action = status === 'Activo' ? 'reactivar' : 'suspender';
    if (!window.confirm(`¿Deseas ${action} el contrato "${contract.code ?? contract.id}"?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateContract(this.token(), contract.id, { status }));
      this.notice.set(status === 'Activo' ? 'Contrato reactivado.' : 'Contrato suspendido.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el estado del contrato.');
    } finally { this.loading.set(false); }
  }

  async remove(contract: Contract): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente el contrato "${contract.code ?? contract.id}"? Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteContract(this.token(), contract.id));
      this.notice.set('Contrato eliminado definitivamente.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el contrato.');
    } finally { this.loading.set(false); }
  }
}
