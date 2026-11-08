import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { PasswordResetPage } from './password-reset.page';

describe('PasswordResetPage', () => {
  const api = {
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PasswordResetPage],
      providers: [
        provideRouter([
          { path: 'forgot-password', component: PasswordResetPage },
          { path: 'reset-password', component: PasswordResetPage },
        ]),
        { provide: ApiService, useValue: api },
      ],
    }).compileComponents();
  });

  it('requests a recovery email and displays the generic message', async () => {
    api.requestPasswordReset.mockReturnValue(of({ ok: true, message: 'Revisa tu correo si existe la cuenta.' }));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/forgot-password', PasswordResetPage);
    page.email = ' client@example.com ';
    await page.submit();
    harness.detectChanges();

    expect(api.requestPasswordReset).toHaveBeenCalledWith('client@example.com');
    expect(harness.routeNativeElement?.querySelector('[role="status"]')?.textContent)
      .toContain('Revisa tu correo');
  });

  it('uses the fragment to reset the password and removes it from the URL', async () => {
    api.confirmPasswordReset.mockReturnValue(of({ ok: true, message: 'Contraseña actualizada.' }));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/reset-password#MTIz/token123', PasswordResetPage);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Location).path(true)).toBe('/reset-password');
    expect(harness.routeDebugElement?.componentInstance).toBe(page);
    page.password = 'New-Password-893!';
    page.confirmPassword = page.password;
    await page.submit();
    harness.detectChanges();
    expect(api.confirmPasswordReset).toHaveBeenCalledWith('MTIz', 'token123', 'New-Password-893!');
    expect(page.password).toBe('');
    expect(page.success).toBe('Contraseña actualizada.');
    expect(harness.routeNativeElement).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Contraseña actualizada');
    expect(harness.routeNativeElement?.querySelector('[role="status"]')?.textContent)
      .toContain('Contraseña actualizada');
  });

  it('reports an invalid link and server errors without pretending to succeed', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/reset-password', PasswordResetPage);
    expect(page.error).toContain('inválido');
    await page.submit();
    expect(api.confirmPasswordReset).not.toHaveBeenCalled();

    const requestPage = await harness.navigateByUrl('/forgot-password', PasswordResetPage);
    api.requestPasswordReset.mockReturnValue(throwError(() => new Error('Servicio no disponible')));
    requestPage.email = 'client@example.com';
    await requestPage.submit();
    expect(requestPage.error).toBe('Servicio no disponible');
    expect(requestPage.completed).toBe(false);
  });
});
