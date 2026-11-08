import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Branch, BranchDetails } from '../core/models';
import chile from '../core/chile-regiones-comunas.json';

@Component({
  selector: 'app-branches',
  imports: [FormsModule],
  templateUrl: './views/branches.component.html',
  styleUrl: './views/accounts.component.css',
})
export class BranchesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Branch | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly regions = chile.regions;
  readonly filteredBranches = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.branches().filter((branch) =>
      [branch.name, branch.address, branch.commune, branch.region]
        .some((value) => value.toLocaleLowerCase('es').includes(term)),
    );
  });

  name = '';
  address = '';
  commune = '';
  region = '';

  get communes(): string[] {
    const region = this.regions.find((item) => item.name === this.region);
    return region?.communes.map((commune) => commune.name) ?? [];
  }

  get legacyRegion(): boolean {
    return !!this.editing() && !!this.region && !this.regions.some((item) => item.name === this.region);
  }

  get legacyCommune(): boolean {
    return !!this.editing() && !!this.commune && !this.communes.includes(this.commune);
  }

  selectRegion(region: string): void {
    if (this.region !== region) {
      this.region = region;
      this.commune = '';
    }
  }

  ngOnInit(): void {
    void this.load();
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
      const response = await firstValueFrom(this.api.listBranches(this.token()));
      this.branches.set(response.branches);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las sucursales.');
    } finally {
      this.loading.set(false);
    }
  }

  create(): void {
    this.cancel();
    this.notice.set('');
    this.formOpen.set(true);
  }

  edit(branch: Branch): void {
    this.editing.set(branch);
    this.name = branch.name;
    this.address = branch.address;
    this.commune = branch.commune;
    this.region = branch.region;
    this.error.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.name = this.address = this.commune = this.region = '';
    this.error.set('');
  }

  async save(form: NgForm): Promise<void> {
    if (form.invalid || this.loading()) return;
    const details: BranchDetails = {
      name: this.name.trim(),
      address: this.address.trim(),
      commune: this.commune.trim(),
      region: this.region.trim(),
    };
    if (!details.name || !details.address || !details.commune || !details.region) {
      this.error.set('Completa todos los campos; no pueden contener solo espacios.');
      return;
    }
    const editing = this.editing();
    const originalLocation = editing && details.region === editing.region && details.commune === editing.commune;
    if (!originalLocation && !this.regions.some((item) =>
      item.name === details.region && item.communes.some((commune) => commune.name === details.commune))) {
      this.error.set('Selecciona una región y una comuna correspondientes de Chile.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      if (editing) {
        await firstValueFrom(this.api.updateBranch(this.token(), editing.id, details));
      } else {
        await firstValueFrom(this.api.createBranch(this.token(), details));
      }
      this.cancel();
      this.notice.set(editing ? 'Sucursal actualizada.' : 'Sucursal creada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la sucursal.');
    } finally {
      this.loading.set(false);
    }
  }

  async setActive(branch: Branch): Promise<void> {
    if (this.loading()) return;
    const action = branch.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} la sucursal "${branch.name}"?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.updateBranch(this.token(), branch.id, { active: !branch.active }));
      this.notice.set(branch.active ? 'Sucursal desactivada.' : 'Sucursal reactivada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar la sucursal.');
    } finally {
      this.loading.set(false);
    }
  }

  async remove(branch: Branch): Promise<void> {
    if (this.loading()) return;
    if (!window.confirm(`¿Eliminar definitivamente la sucursal "${branch.name}"? Esta acción no se puede deshacer.`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.api.deleteBranch(this.token(), branch.id));
      this.notice.set('Sucursal eliminada definitivamente.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar la sucursal.');
    } finally {
      this.loading.set(false);
    }
  }
}
