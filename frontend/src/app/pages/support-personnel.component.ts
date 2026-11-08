import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Branch, HardwareCategory, PersonnelAvailability, PersonnelDetails, PersonnelUser, SupportPerson } from '../core/models';

@Component({
  selector: 'app-support-personnel',
  imports: [FormsModule],
  templateUrl: './views/support-personnel.component.html',
  styleUrl: './views/accounts.component.css',
})
export class SupportPersonnelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly personnel = signal<SupportPerson[]>([]);
  readonly users = signal<PersonnelUser[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly categories = signal<HardwareCategory[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<SupportPerson | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filteredPersonnel = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.personnel().filter((person) =>
      [person.user_name, person.user_email, person.user_role, person.branch_name, person.category_name ?? '',
        person.availability, person.active ? 'activo' : 'inactivo']
        .some((value) => value.toLocaleLowerCase('es').includes(term)));
  });
  userId: number | null = null;
  branchId: number | null = null;
  categoryId: number | null = null;
  availability: PersonnelAvailability = 'Disponible';
  readonly userMatchesSelection = (user: PersonnelUser): boolean => user.id === this.editing()?.user_id;
  readonly categoryMatchesSelection = (category: HardwareCategory): boolean => category.id === this.editing()?.category_id;
  readonly branchMatchesSelection = (branch: Branch): boolean => branch.id === this.editing()?.branch_id;
  isRegistered(user: PersonnelUser): boolean {
    return this.personnel().some((person) => person.user_id === user.id && person.id !== this.editing()?.id);
  }

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
      const response = await firstValueFrom(this.api.listSupportPersonnel(this.token()));
      this.personnel.set(response.personnel);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el personal operativo.');
    } finally { this.loading.set(false); }
  }

  async open(person: SupportPerson | null): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const token = this.token();
      const response = await firstValueFrom(forkJoin({
        users: this.api.listPersonnelUsers(token),
        branches: this.api.listBranches(token),
        categories: this.api.listHardwareCategories(token),
      }));
      this.users.set(response.users.users);
      this.branches.set(response.branches.branches);
      this.categories.set(response.categories.categories);
      this.editing.set(person);
      this.userId = person?.user_id ?? null;
      this.branchId = person?.branch_id ?? null;
      this.categoryId = person?.category_id ?? null;
      this.availability = person?.availability ?? 'Disponible';
      this.formOpen.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las cuentas, sucursales y categorías.');
    } finally { this.loading.set(false); }
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (this.loading() || form.invalid) return;
    if (this.userId === null) {
      this.error.set('Selecciona una cuenta de soporte o ejecutivo.');
      return;
    }
    if (this.branchId === null) {
      this.error.set('Selecciona una sucursal.');
      return;
    }
    const details: PersonnelDetails = {
      user_id: this.userId, branch_id: this.branchId, category_id: this.categoryId, availability: this.availability,
    };
    const editing = this.editing();
    this.loading.set(true);
    this.error.set('');
    try {
      if (editing) await firstValueFrom(this.api.updateSupportPerson(this.token(), editing.id, details));
      else await firstValueFrom(this.api.createSupportPerson(this.token(), details));
      this.cancel();
      this.notice.set(editing ? 'Personal actualizado.' : 'Personal registrado.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el registro de personal.');
    } finally { this.loading.set(false); }
  }

  async setActive(person: SupportPerson): Promise<void> {
    if (this.loading()) return;
    const action = person.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} el registro de "${person.user_name}"? La cuenta no cambiará.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateSupportPerson(this.token(), person.id, { active: !person.active }));
      this.notice.set(person.active ? 'Personal desactivado en el catálogo.' : 'Personal reactivado en el catálogo.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el personal.');
    } finally { this.loading.set(false); }
  }

  async remove(person: SupportPerson): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente el registro de "${person.user_name}" del catálogo? La cuenta se conservará. Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteSupportPerson(this.token(), person.id));
      this.notice.set('Registro de personal eliminado del catálogo.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el registro de personal.');
    } finally { this.loading.set(false); }
  }
}
