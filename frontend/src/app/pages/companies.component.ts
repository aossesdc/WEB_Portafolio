import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Company, CompanyDetails } from '../core/models';

@Component({
  selector: 'app-companies',
  imports: [FormsModule],
  templateUrl: './views/companies.component.html',
  styleUrl: './views/accounts.component.css',
})
export class CompaniesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly companies = signal<Company[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Company | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filteredCompanies = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.companies().filter((company) =>
      [company.rut, company.name, company.email, company.business ?? '']
        .some((value) => value.toLocaleLowerCase('es').includes(term)));
  });
  rut = '';
  name = '';
  business = '';
  address = '';
  email = '';
  phone = '';
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
      const response = await firstValueFrom(this.api.listCompanies(this.token()));
      this.companies.set(response.companies);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las empresas.');
    } finally { this.loading.set(false); }
  }

  open(company: Company | null): void {
    if (this.loading()) return;
    this.error.set('');
    this.notice.set('');
    this.editing.set(company);
    this.rut = company?.rut ?? '';
    this.name = company?.name ?? '';
    this.business = company?.business ?? '';
    this.address = company?.address ?? '';
    this.email = company?.email ?? '';
    this.phone = company?.phone ?? '';
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.rut = this.name = this.business = this.address = this.email = this.phone = '';
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (form.invalid || this.loading()) return;
    const details: Omit<CompanyDetails, 'user_id'> = {
      rut: this.rut.trim(), name: this.name.trim(), email: this.email.trim(),
      business: this.business.trim() || null, address: this.address.trim() || null,
      phone: this.phone.trim() || null,
    };
    if (!details.rut || !details.name || !details.email) {
      this.error.set('Completa el RUT, el nombre de la empresa y el correo de contacto.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const editing = this.editing();
    try {
      if (editing) await firstValueFrom(this.api.updateCompany(this.token(), editing.id, details));
      else await firstValueFrom(this.api.createCompany(this.token(), details));
      this.cancel();
      this.notice.set(editing ? 'Empresa actualizada.' : 'Empresa registrada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la empresa.');
    } finally { this.loading.set(false); }
  }

  async setActive(company: Company): Promise<void> {
    if (this.loading()) return;
    const action = company.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} la empresa "${company.name}"?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateCompany(this.token(), company.id, { active: !company.active }));
      this.notice.set(company.active ? 'Empresa desactivada.' : 'Empresa reactivada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar la empresa.');
    } finally { this.loading.set(false); }
  }

  async remove(company: Company): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente la empresa "${company.name}"? Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteCompany(this.token(), company.id));
      this.notice.set('Empresa eliminada definitivamente.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar la empresa.');
    } finally { this.loading.set(false); }
  }
}
