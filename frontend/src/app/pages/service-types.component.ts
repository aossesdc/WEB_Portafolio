import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ServicePriority, ServiceType, ServiceTypeDetails } from '../core/models';

@Component({
  selector: 'app-service-types',
  imports: [FormsModule],
  templateUrl: './views/service-types.component.html',
  styleUrls: ['./views/accounts.component.css', './views/contracts.component.css'],
})
export class ServiceTypesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<ServiceType | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filteredServiceTypes = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.serviceTypes().filter((service) =>
      [service.name, service.description, service.priority, service.active ? 'activo' : 'inactivo']
        .some((value) => value.toLocaleLowerCase('es').includes(term)));
  });
  name = '';
  description = '';
  priority: ServicePriority = 'Media';

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
      const response = await firstValueFrom(this.api.listServiceTypes(this.token()));
      this.serviceTypes.set(response.service_types);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los tipos de servicio.');
    } finally { this.loading.set(false); }
  }

  open(service: ServiceType | null): void {
    if (this.loading()) return;
    this.error.set('');
    this.notice.set('');
    this.editing.set(service);
    this.name = service?.name ?? '';
    this.description = service?.description ?? '';
    this.priority = service?.priority ?? 'Media';
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (this.loading() || form.invalid) return;
    const details: ServiceTypeDetails = {
      name: this.name.trim(), description: this.description.trim(), priority: this.priority,
    };
    if (!details.name || !details.description) {
      this.error.set('Completa el nombre y la descripción del servicio.');
      return;
    }
    const editing = this.editing();
    this.loading.set(true);
    this.error.set('');
    try {
      if (editing) await firstValueFrom(this.api.updateServiceType(this.token(), editing.id, details));
      else await firstValueFrom(this.api.createServiceType(this.token(), details));
      this.cancel();
      this.notice.set(editing ? 'Tipo de servicio actualizado.' : 'Tipo de servicio registrado.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el tipo de servicio.');
    } finally { this.loading.set(false); }
  }

  async setActive(service: ServiceType): Promise<void> {
    if (this.loading()) return;
    const action = service.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} el tipo de servicio "${service.name}"?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateServiceType(this.token(), service.id, { active: !service.active }));
      this.notice.set(service.active ? 'Tipo de servicio desactivado.' : 'Tipo de servicio reactivado.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el tipo de servicio.');
    } finally { this.loading.set(false); }
  }

  async remove(service: ServiceType): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente el tipo de servicio "${service.name}"? Los contratos y categorías asociados quedarán sin este tipo de servicio. Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteServiceType(this.token(), service.id));
      this.notice.set('Tipo de servicio eliminado definitivamente.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el tipo de servicio.');
    } finally { this.loading.set(false); }
  }
}
