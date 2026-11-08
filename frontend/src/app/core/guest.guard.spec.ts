import { Location } from '@angular/common';
import { provideLocationMocks, SpyLocation } from '@angular/common/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationSkipped, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom, take } from 'rxjs';
import { AuthService } from './auth.service';
import { guestGuard } from './guest.guard';
import { User } from './models';
import { roleGuard } from './role.guard';

@Component({ template: 'Página' })
class Page {}

describe('authenticated navigation', () => {
  const user = signal<User | null>(null);

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page, canActivate: [guestGuard] },
          { path: 'login/:profile', component: Page, canActivate: [guestGuard] },
          { path: 'register', component: Page, canActivate: [guestGuard] },
          { path: 'help', component: Page },
          { path: 'reset-password', component: Page },
          { path: 'dashboard/:area', component: Page, canActivate: [roleGuard] },
        ]),
        provideLocationMocks(),
        { provide: AuthService, useValue: { user: user.asReadonly() } },
      ],
    });
  });

  it.each([
    ['client', 'Cliente', 'client'],
    ['executive', 'Ejecutivo', 'executive'],
    ['soporte', 'Soporte', 'support'],
    ['tech', 'Técnico', 'support'],
    ['admin', 'Administrador', 'admin'],
  ] as const)('keeps the %s user in the correct portal on back navigation', async (role, profile, area) => {
    const harness = await RouterTestingHarness.create('/login/client');
    TestBed.inject(Router).setUpLocationChangeListener();
    user.set({ id: 1, name: 'Usuario', email: 'user@example.com', role, profile });
    await harness.navigateByUrl(`/dashboard/${area}`);
    const location = TestBed.inject(Location) as SpyLocation;
    const router = TestBed.inject(Router);
    const navigation = firstValueFrom(router.events.pipe(
      filter((event) => event instanceof NavigationEnd || event instanceof NavigationSkipped),
      take(1),
    ));
    location.back();
    await navigation;
    await harness.fixture.whenStable();
    expect(router.url).toBe(`/dashboard/${area}`);
    expect(location.path()).toBe(`/dashboard/${area}`);
    expect(user()).not.toBeNull();
  });

  it('redirects guest pages and wrong portals, but leaves help and recovery accessible', async () => {
    const harness = await RouterTestingHarness.create('/');
    user.set({ id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin', profile: 'Admin' });
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/dashboard/admin');
    for (const path of ['/', '/login/client', '/login/executive', '/login/admin', '/register', '/dashboard/client']) {
      await harness.navigateByUrl(path);
      expect(router.url).toBe('/dashboard/admin');
    }
    await harness.navigateByUrl('/help');
    expect(router.url).toBe('/help');
    await harness.navigateByUrl('/reset-password#uid/token');
    expect(router.url).toBe('/reset-password#uid/token');
    user.set(null);
    await harness.navigateByUrl('/login/client');
    expect(router.url).toBe('/login/client');
    await harness.navigateByUrl('/dashboard/admin');
    expect(router.url).toBe('/login/admin');
  });

  it('does not restore access to a protected portal after logout and back', async () => {
    const harness = await RouterTestingHarness.create('/login/client');
    const router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    user.set({ id: 1, name: 'Cliente', email: 'user@example.com', role: 'client', profile: 'Cliente' });
    await harness.navigateByUrl('/dashboard/client');
    user.set(null);
    await harness.navigateByUrl('/');
    const navigation = firstValueFrom(router.events.pipe(
      filter((event) => event instanceof NavigationEnd || event instanceof NavigationSkipped),
      take(1),
    ));
    (TestBed.inject(Location) as SpyLocation).back();
    await navigation;
    await harness.fixture.whenStable();
    expect(router.url).toBe('/login/client');
  });
});
