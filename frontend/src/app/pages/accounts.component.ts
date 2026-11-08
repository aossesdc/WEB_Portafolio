import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Account, AccountUpdate, StaffAccountCreate, UserRole } from '../core/models';

type StaffRole = StaffAccountCreate['role'];

@Component({
  selector: 'app-accounts',
  imports: [FormsModule],
  templateUrl: './views/accounts.component.html',
  styleUrl: './views/accounts.component.css',
})
export class AccountsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly currentUser = this.auth.user;
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editing = signal<Account | null>(null);
  readonly formOpen = signal(false);
  readonly search = signal('');
  readonly filteredAccounts = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('es');
    if (!term) return this.accounts();
    return this.accounts().filter((account) =>
      [this.accountName(account), account.email, this.roleName(account.role), account.employee_code ?? '']
        .some((value) => value.toLocaleLowerCase('es').includes(term)),
    );
  });

  role: StaffRole = 'ejecutivo';
  email = '';
  password = '';
  confirmPassword = '';
  fullName = '';
  employeeCode = '';
  firstName = '';
  lastName = '';
  phone = '';

  ngOnInit(): void {
    void this.load();
  }

  roleName(role: UserRole): string {
    const names: Record<UserRole, string> = {
      admin: 'Administrador', executive: 'Ejecutivo', soporte: 'Soporte',
      tech: 'Técnico', client: 'Cliente',
    };
    return names[role];
  }

  accountName(account: Account): string {
    return account.role === 'client'
      ? `${account.first_name ?? ''} ${account.last_name ?? ''}`.trim()
      : account.full_name ?? '';
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
      const result = await firstValueFrom(this.api.listAccounts(this.token()));
      this.accounts.set(result.accounts);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las cuentas.');
    } finally {
      this.loading.set(false);
    }
  }

  edit(account: Account): void {
    this.editing.set(account);
    this.formOpen.set(true);
    this.email = account.email;
    this.password = '';
    this.confirmPassword = '';
    this.firstName = account.first_name ?? '';
    this.lastName = account.last_name ?? '';
    this.phone = account.phone ?? '';
    this.fullName = account.full_name ?? '';
    this.employeeCode = account.employee_code ?? '';
    this.error.set('');
    this.notice.set('');
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.error.set('');
    this.email = this.password = this.confirmPassword = this.firstName = this.lastName = this.phone = this.fullName = this.employeeCode = '';
    this.role = 'ejecutivo';
  }

  create(): void {
    this.cancel();
    this.error.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  async save(form: NgForm): Promise<void> {
    if (form.invalid || this.loading()) return;
    if (!this.editing() && this.password !== this.confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const editing = this.editing();
      const password = this.password ? { password: this.password } : {};
      if (editing) {
        const values: AccountUpdate = {
          email: this.email,
          ...password,
          ...(editing.role === 'client'
            ? { first_name: this.firstName, last_name: this.lastName, phone: this.phone }
            : { full_name: this.fullName, employee_code: this.employeeCode }),
        };
        await firstValueFrom(this.api.updateAccount(this.token(), editing.id, values));
      } else {
        await firstValueFrom(this.api.createAccount(this.token(), {
          email: this.email, password: this.password, role: this.role,
          full_name: this.fullName, employee_code: this.employeeCode,
        }));
      }
      this.cancel();
      this.notice.set(editing ? 'Cuenta actualizada.' : 'Cuenta creada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la cuenta.');
    } finally {
      this.loading.set(false);
    }
  }

  async setActive(account: Account): Promise<void> {
    const action = account.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} la cuenta ${account.email}?`)) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (account.active) {
        await firstValueFrom(this.api.deactivateAccount(this.token(), account.id));
      } else {
        await firstValueFrom(this.api.updateAccount(this.token(), account.id, { active: true }));
      }
      this.notice.set(account.active ? 'Cuenta desactivada.' : 'Cuenta reactivada.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar la cuenta.');
    } finally {
      this.loading.set(false);
    }
  }
}
