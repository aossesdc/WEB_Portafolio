import { Location } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { ApiService } from '../core/api.service';
import { DisplayPreferencesComponent } from '../core/display-preferences.component';

@Component({
  imports: [DisplayPreferencesComponent, FormsModule, RouterLink],
  templateUrl: './views/password-reset.page.html',
  styleUrl: './views/auth.page.css',
})
export class PasswordResetPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(ApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly isConfirmation = this.route.snapshot.routeConfig?.path === 'reset-password';
  private readonly parts = (this.route.snapshot.fragment ?? '').split('/');
  private readonly uid = this.parts.length === 2 ? this.parts[0] : '';
  private readonly token = this.parts.length === 2 ? this.parts[1] : '';
  email = '';
  password = '';
  confirmPassword = '';
  busy = false;
  completed = false;
  error = '';
  success = '';

  constructor() {
    if (this.isConfirmation) {
      if (!this.uid || !this.token) {
        this.error = 'El enlace es inválido o ha vencido. Solicita uno nuevo.';
      }
      this.router.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.location.replaceState(this.router.url.split('#')[0]));
    }
  }

  async submit(): Promise<void> {
    this.error = '';
    this.success = '';
    if (this.isConfirmation) {
      if (!this.uid || !this.token) {
        this.error = 'El enlace es inválido o ha vencido. Solicita uno nuevo.';
        return;
      }
      if (this.password.trim().length < 8 || this.password.length > 128) {
        this.error = 'La contraseña debe tener entre 8 y 128 caracteres.';
        return;
      }
      if (this.password !== this.confirmPassword) {
        this.error = 'Las contraseñas no coinciden.';
        return;
      }
    } else if (this.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error = 'Ingresa un correo electrónico válido.';
      return;
    }
    this.busy = true;
    try {
      const response = this.isConfirmation
        ? await firstValueFrom(this.api.confirmPasswordReset(this.uid, this.token, this.password))
        : await firstValueFrom(this.api.requestPasswordReset(this.email.trim()));
      this.success = response.message;
      this.completed = true;
      this.password = '';
      this.confirmPassword = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'No fue posible completar la solicitud.';
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }
}
