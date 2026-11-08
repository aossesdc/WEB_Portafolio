import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { HardwareCategory, HardwareCategoryDetails, ServiceType } from '../core/models';

@Component({
  selector: 'app-hardware-categories',
  imports: [FormsModule],
  templateUrl: './views/hardware-categories.component.html',
  styleUrls: ['./views/accounts.component.css', './views/contracts.component.css'],
})
export class HardwareCategoriesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly categories = signal<HardwareCategory[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<HardwareCategory | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filteredCategories = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.categories().filter((category) =>
      [category.name, category.description, category.service_type_name ?? '', category.active ? 'activo' : 'inactivo']
        .some((value) => value.toLocaleLowerCase('es').includes(term)));
  });
  name = '';
  description = '';
  serviceTypeId: number | null = null;
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
      const response = await firstValueFrom(this.api.listHardwareCategories(this.token()));
      this.categories.set(response.categories);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las categorías de equipos.');
    } finally { this.loading.set(false); }
  }

  async open(category: HardwareCategory | null): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const response = await firstValueFrom(this.api.listServiceTypes(this.token()));
      this.serviceTypes.set(response.service_types);
      this.editing.set(category);
      this.name = category?.name ?? '';
      this.description = category?.description ?? '';
      this.serviceTypeId = category?.service_type_id ?? null;
      this.formOpen.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los tipos de servicio.');
    } finally { this.loading.set(false); }
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (this.loading() || form.invalid) return;
    const details: HardwareCategoryDetails = {
      name: this.name.trim(), description: this.description.trim(), service_type_id: this.serviceTypeId,
    };
    if (!details.name || !details.description) {
      this.error.set('Completa el nombre y la descripción de la categoría.');
      return;
    }
    const editing = this.editing();
    this.loading.set(true);
    this.error.set('');
    try {
      if (editing) await firstValueFrom(this.api.updateHardwareCategory(this.token(), editing.id, details));
      else await firstValueFrom(this.api.createHardwareCategory(this.token(), details));
      this.cancel();
      this.notice.set(editing ? 'Categoría actualizada.' : 'Categoría registrada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la categoría.');
    } finally { this.loading.set(false); }
  }

  async setActive(category: HardwareCategory): Promise<void> {
    if (this.loading()) return;
    const action = category.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} la categoría "${category.name}"?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateHardwareCategory(this.token(), category.id, { active: !category.active }));
      this.notice.set(category.active ? 'Categoría desactivada.' : 'Categoría reactivada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar la categoría.');
    } finally { this.loading.set(false); }
  }

  async remove(category: HardwareCategory): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente la categoría "${category.name}"? El personal asociado quedará sin esta categoría. Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteHardwareCategory(this.token(), category.id));
      this.notice.set('Categoría eliminada definitivamente.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar la categoría.');
    } finally { this.loading.set(false); }
  }
}
