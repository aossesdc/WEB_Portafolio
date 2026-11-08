import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { dashboardFor } from './dashboard-route';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  const area = route.paramMap.get('area');

  const allowed = !!user && (
    (area === 'client' && user.role === 'client')
    || (area === 'admin' && user.role === 'admin')
    || (area === 'executive' && user.role === 'executive' && !user.profile.toLowerCase().includes('soporte'))
    || (area === 'support' && (
      ['tech', 'soporte'].includes(user.role) || user.profile.toLowerCase().includes('soporte')
    ))
  );
  if (allowed) return true;
  if (user) return router.createUrlTree(['/dashboard', dashboardFor(user)]);

  const profile = area === 'admin' ? 'admin' : area === 'client' ? 'client' : 'executive';
  return router.createUrlTree(['/login', profile]);
};
