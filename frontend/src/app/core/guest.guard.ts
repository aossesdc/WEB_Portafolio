import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { dashboardFor } from './dashboard-route';

export const guestGuard: CanActivateFn = () => {
  const user = inject(AuthService).user();
  if (!user) return true;
  const router = inject(Router);
  return new RedirectCommand(router.createUrlTree(['/dashboard', dashboardFor(user)]), {
    replaceUrl: true,
  });
};
