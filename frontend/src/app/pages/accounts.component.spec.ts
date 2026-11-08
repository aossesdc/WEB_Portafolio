import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Account } from '../core/models';
import { AccountsComponent } from './accounts.component';

describe('AccountsComponent', () => {
  const customer: Account = {
    id: 2, email: 'cliente@example.com', role: 'client', active: true,
    first_name: 'Ana', last_name: 'Pérez', phone: '',
  };
  let component: AccountsComponent;
  let api: {
    listAccounts: ReturnType<typeof vi.fn>;
    createAccount: ReturnType<typeof vi.fn>;
    updateAccount: ReturnType<typeof vi.fn>;
    deactivateAccount: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listAccounts: vi.fn().mockReturnValue(of({ ok: true, accounts: [customer] })),
      createAccount: vi.fn().mockReturnValue(of({ ok: true })),
      updateAccount: vi.fn().mockReturnValue(of({ ok: true })),
      deactivateAccount: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [AccountsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'token', user: signal({ id: 1 }) } },
      ],
    }).compileComponents();
    component = TestBed.createComponent(AccountsComponent).componentInstance;
  });

  it('creates staff with a role, but never offers client creation', async () => {
    component.email = 'staff@example.com';
    component.password = 'Safe-Password-893!';
    component.confirmPassword = component.password;
    component.fullName = 'Soporte';
    component.role = 'soporte';
    await component.save({ invalid: false } as NgForm);
    expect(api.createAccount).toHaveBeenCalledWith('token', expect.objectContaining({ role: 'soporte' }));
    expect(component.notice()).toBe('Cuenta creada.');
  });

  it('edits a client without submitting a role or an unchanged password', async () => {
    component.edit(customer);
    component.firstName = 'Beatriz';
    await component.save({ invalid: false } as NgForm);
    expect(api.updateAccount).toHaveBeenCalledWith('token', 2, {
      email: customer.email, first_name: 'Beatriz', last_name: 'Pérez', phone: '',
    });
  });

  it('confirms deactivation and exposes API errors', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deactivateAccount.mockReturnValue(throwError(() => new Error('No autorizado')));
    await component.setActive(customer);
    expect(api.deactivateAccount).toHaveBeenCalledWith('token', 2);
    expect(component.error()).toBe('No autorizado');
  });

  it('renders staff roles for creation and client fields without role editing', async () => {
    const fixture = TestBed.createComponent(AccountsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select[name="role"]')).toBeNull();
    const createButton = Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Crear cuenta');
    createButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const roles = element.querySelector('select[name="role"]') as HTMLSelectElement;
    expect(Array.from(roles.options).map((option) => option.value)).toEqual(['ejecutivo', 'soporte', 'admin']);
    fixture.componentInstance.edit(customer);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('select[name="role"]')).toBeNull();
    expect(element.querySelector('input[name="firstName"]')).not.toBeNull();
    expect(element.querySelector('input[name="lastName"]')).not.toBeNull();
  });

  it('filters by name, email, role and employee code and restores results', () => {
    component.accounts.set([
      customer,
      { id: 3, email: 'staff@example.com', role: 'soporte', active: true, full_name: 'Luis Rojas', employee_code: 'SOP-42' },
    ]);
    for (const term of ['ana', 'CLIENTE@EXAMPLE', 'cliente']) {
      component.search.set(term);
      expect(component.filteredAccounts().map((account) => account.id)).toEqual([2]);
    }
    for (const term of ['rojas', 'soporte', 'sop-42']) {
      component.search.set(term);
      expect(component.filteredAccounts().map((account) => account.id)).toEqual([3]);
    }
    component.search.set('no existe');
    expect(component.filteredAccounts()).toEqual([]);
    component.search.set('');
    expect(component.filteredAccounts()).toHaveLength(2);
  });

  it('keeps the form open on mismatched passwords and clears it on cancel', async () => {
    component.create();
    component.password = 'Safe-Password-893!';
    component.confirmPassword = 'otra contraseña';
    await component.save({ invalid: false } as NgForm);
    expect(api.createAccount).not.toHaveBeenCalled();
    expect(component.error()).toBe('Las contraseñas no coinciden.');
    expect(component.formOpen()).toBe(true);
    component.cancel();
    expect(component.formOpen()).toBe(false);
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
  });
});
