import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { User } from '../core/models';
import { AuthPage } from './auth.page';

describe('AuthPage', () => {
  let fixture: ComponentFixture<AuthPage>;
  let page: AuthPage;
  let router: Router;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ profile: 'client' }));
    auth = {
      login: vi.fn(),
      register: vi.fn(),
      clearSession: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { routeConfig: { path: 'login/:profile' } },
            paramMap: params.asObservable(),
          },
        },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthPage);
    page = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('updates the displayed profile when the login route parameter changes', () => {
    page.email = 'usuario@example.com';
    page.password = 'Password123';
    page.showPassword = true;
    page.captchaAnswer = 4;
    page.error = 'Error anterior';
    params.next(convertToParamMap({ profile: 'executive' }));
    fixture.detectChanges();

    expect(page.profile).toBe('executive');
    expect(page.profileLabel).toBe('Portal ejecutivo');
    expect(page.email).toBe('usuario@example.com');
    expect(page.password).toBe('');
    expect(page.showPassword).toBe(false);
    expect(page.captchaAnswer).toBeNull();
    expect(page.error).toBe('');
  });

  it.each([
    ['client', 'Portal de clientes'],
    ['executive', 'Portal ejecutivo'],
    ['admin', 'Portal de administración'],
  ])('uses the same login layout for the %s portal', (profile, label) => {
    params.next(convertToParamMap({ profile }));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.auth-page')?.className).toBe('auth-page');
    expect(root.querySelector('.auth-form-wrap .eyebrow')?.textContent).toContain(label);
    expect(root.querySelector('#email')).not.toBeNull();
    expect(root.querySelector('#password')).not.toBeNull();
    expect(root.querySelector('#captcha')).not.toBeNull();
    expect(root.querySelector('.login-button')?.textContent).toContain('Iniciar sesión');
    expect(root.textContent).not.toContain('datos de ejemplo');
    expect(root.textContent).not.toContain('PostgreSQL');
  });

  it.each([
    ['client', true],
    ['executive', false],
    ['admin', false],
  ])('shows password recovery only for the %s login', (profile, visible) => {
    params.next(convertToParamMap({ profile }));
    fixture.detectChanges();
    expect(Boolean(fixture.nativeElement.querySelector('a[href="/forgot-password"]'))).toBe(visible);
  });

  it('shows validation feedback when the login form is submitted empty', async () => {
    const button = fixture.nativeElement.querySelector('.login-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.error).toBe('Ingresa tu correo y contraseña.');
  });

  it('toggles password visibility and resets the verification answer', () => {
    page.isRegister = true;
    page.captchaAnswer = page.captchaA + page.captchaB;
    fixture.detectChanges();

    const toggles = fixture.nativeElement.querySelectorAll(
      '.password-toggle',
    ) as NodeListOf<HTMLButtonElement>;
    toggles[0].click();
    toggles[1].click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector('#password') as HTMLInputElement).type,
    ).toBe('text');
    expect(
      (fixture.nativeElement.querySelector('#confirmPassword') as HTMLInputElement).type,
    ).toBe('text');

    (fixture.nativeElement.querySelector('.captcha-refresh') as HTMLButtonElement).click();
    expect(page.captchaAnswer).toBeNull();
  });

  it('registers a client and keeps the email available after success', async () => {
    page.isRegister = true;
    page.name = '  Cliente ';
    page.surname = ' de prueba  ';
    page.email = ' cliente@example.com ';
    page.password = 'Password123';
    page.confirmPassword = 'Password123';
    page.captchaAnswer = page.captchaA + page.captchaB;
    auth.register.mockResolvedValue('Cuenta creada correctamente.');

    await page.submit();

    expect(auth.register).toHaveBeenCalledWith(
      'Cliente',
      'de prueba',
      'cliente@example.com',
      'Password123',
    );
    expect(page.success).toBe('Cuenta creada correctamente.');
    expect(page.email).toBe(' cliente@example.com ');
    expect(page.surname).toBe('');
    expect(page.password).toBe('');
    expect(page.confirmPassword).toBe('');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.form-message.success')?.textContent).toContain(
      'Cuenta creada correctamente.',
    );
    expect((fixture.nativeElement.querySelector('.login-button') as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('signs in and opens the dashboard that matches the authenticated role', async () => {
    const user: User = {
      id: 1,
      name: 'Cliente de prueba',
      email: 'cliente@example.com',
      profile: 'Cliente corporativo',
      role: 'client',
    };
    page.email = user.email;
    page.password = 'Password123';
    page.captchaAnswer = page.captchaA + page.captchaB;
    auth.login.mockResolvedValue(user);

    await page.submit();

    expect(auth.login).toHaveBeenCalledWith(user.email, 'Password123');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'client']);
  });

  it('clears the session when the account does not match the selected profile', async () => {
    const user: User = {
      id: 1,
      name: 'Cliente de prueba',
      email: 'cliente@example.com',
      profile: 'Cliente corporativo',
      role: 'client',
    };
    params.next(convertToParamMap({ profile: 'admin' }));
    page.email = user.email;
    page.password = 'Password123';
    page.captchaAnswer = page.captchaA + page.captchaB;
    auth.login.mockResolvedValue(user);

    await page.submit();

    expect(auth.clearSession).toHaveBeenCalled();
    expect(page.error).toBe('Esta cuenta no tiene acceso a este perfil.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['client', 'client', 'client'],
    ['executive', 'executive', 'executive'],
    ['executive', 'tech', 'support'],
    ['executive', 'soporte', 'support'],
    ['admin', 'admin', 'admin'],
  ] as const)('accepts %s access for role %s', async (profile, role, dashboard) => {
    params.next(convertToParamMap({ profile }));
    const user: User = {
      id: 1,
      name: 'Usuario',
      email: 'usuario@example.com',
      profile: role,
      role,
    };
    page.email = user.email;
    page.password = 'Password123';
    page.captchaAnswer = page.captchaA + page.captchaB;
    auth.login.mockResolvedValue(user);

    await page.submit();

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', dashboard]);
  });

  it.each([
    ['client', 'admin'],
    ['client', 'executive'],
    ['client', 'tech'],
    ['client', 'soporte'],
    ['executive', 'client'],
    ['executive', 'admin'],
    ['admin', 'client'],
    ['admin', 'executive'],
    ['admin', 'tech'],
    ['admin', 'soporte'],
  ] as const)('rejects %s access for role %s', async (profile, role) => {
    params.next(convertToParamMap({ profile }));
    const user: User = {
      id: 1,
      name: 'Usuario',
      email: 'usuario@example.com',
      profile: role,
      role,
    };
    page.email = user.email;
    page.password = 'Password123';
    page.captchaAnswer = page.captchaA + page.captchaB;
    auth.login.mockResolvedValue(user);

    await page.submit();

    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(page.error).toBe('Esta cuenta no tiene acceso a este perfil.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('login portal navigation', () => {
  it('navigates between every portal and identifies the current one', async () => {
    await TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [
        provideRouter([{ path: 'login/:profile', component: AuthPage }]),
        { provide: AuthService, useValue: { login: vi.fn(), clearSession: vi.fn() } },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/login/client');
    const router = TestBed.inject(Router);

    for (const [destination, label] of [
      ['/login/executive', 'Ejecutivo y soporte'],
      ['/login/admin', 'Administración'],
      ['/login/client', 'Clientes'],
      ['/login/admin', 'Administración'],
      ['/login/executive', 'Ejecutivo y soporte'],
      ['/login/client', 'Clientes'],
    ]) {
      const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(
        `.login-portals a[href="${destination}"]`,
      );
      expect(link).not.toBeNull();
      link!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(router.url).toBe(destination);
      expect(harness.routeNativeElement?.querySelector('[aria-current="page"]')?.textContent)
        .toContain(label);
      expect(harness.routeNativeElement?.querySelectorAll('.login-portals a')).toHaveLength(2);
    }
  });
});
