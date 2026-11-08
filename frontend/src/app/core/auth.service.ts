import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { User } from './models';

const USER_KEY = 'sla-session-user';
const TOKEN_KEY = 'sla-session-token';
const EXPIRES_KEY = 'sla-session-expires-at';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly currentUser = signal<User | null>(this.readUser());

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  token(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(this.api.login(email, password));
    sessionStorage.setItem(TOKEN_KEY, response.sessionToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(response.user));
    sessionStorage.setItem(EXPIRES_KEY, response.expiresAt);
    this.currentUser.set(response.user);
    return response.user;
  }

  async register(name: string, surname: string, email: string, password: string): Promise<string> {
    const response = await firstValueFrom(this.api.register(name, surname, email, password));
    return response.message;
  }

  logout(): void {
    this.clearSession();
  }

  clearSession(): void {
    this.clearStoredSession();
    this.currentUser.set(null);
  }

  private clearStoredSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  }

  private readUser(): User | null {
    const stored = sessionStorage.getItem(USER_KEY);
    if (!stored) {
      if (sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(EXPIRES_KEY)) {
        this.clearStoredSession();
      }
      return null;
    }
    try {
      const expiresAt = Date.parse(sessionStorage.getItem(EXPIRES_KEY) ?? '');
      if (
        !sessionStorage.getItem(TOKEN_KEY) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        this.clearStoredSession();
        return null;
      }
      return JSON.parse(stored) as User;
    } catch (error) {
      console.warn('Se descartó una sesión local inválida.', error);
      this.clearStoredSession();
      return null;
    }
  }
}
