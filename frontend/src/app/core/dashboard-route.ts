import { User } from './models';

export function dashboardFor(user: User): 'client' | 'admin' | 'executive' | 'support' {
  if (user.role === 'client') return 'client';
  if (user.role === 'admin') return 'admin';
  return ['tech', 'soporte'].includes(user.role) || user.profile.toLowerCase().includes('soporte')
    ? 'support'
    : 'executive';
}
