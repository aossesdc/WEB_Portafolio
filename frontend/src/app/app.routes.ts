import { Routes } from '@angular/router';
import { roleGuard } from './core/role.guard';
import { guestGuard } from './core/guest.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/home.page').then((module) => module.HomePage),
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help.page').then((module) => module.HelpPage),
  },
  {
    path: 'login/:profile',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth.page').then((module) => module.AuthPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth.page').then((module) => module.AuthPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/password-reset.page').then((module) => module.PasswordResetPage),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/password-reset.page').then((module) => module.PasswordResetPage),
  },
  {
    path: 'dashboard/:area',
    canActivate: [roleGuard],
    loadComponent: () => import('./pages/dashboard.page').then((module) => module.DashboardPage),
  },
  {
    path: 'preview/:area',
    loadComponent: () => import('./pages/dashboard.page').then((module) => module.DashboardPage),
  },
  { path: '**', redirectTo: '' },
];
