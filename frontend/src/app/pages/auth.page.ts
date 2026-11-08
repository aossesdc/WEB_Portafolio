import { ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth.service';
import { User } from '../core/models';
import { DisplayPreferencesComponent } from '../core/display-preferences.component';
import { dashboardFor } from '../core/dashboard-route';

type LoginProfile = 'client' | 'executive' | 'admin';

@Component({
  imports: [DisplayPreferencesComponent, FormsModule, RouterLink],
  templateUrl: './views/auth.page.html',
  styleUrl: './views/auth.page.css',
})
export class AuthPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  profile: LoginProfile = 'client';
  profileLabel = 'Portal de clientes';
  isRegister = false;
  name = '';
  surname = '';
  email = '';
  password = '';
  confirmPassword = '';
  captchaAnswer: number | null = null;
  captchaA = 4;
  captchaB = 3;
  showPassword = false;
  showConfirmPassword = false;
  busy = false;
  error = '';
  success = '';

  get brandHeading(): string {
    return 'Accede a tu cuenta de forma segura.';
  }

  get brandDescription(): string {
    return 'Ingresa al portal que corresponde a tu perfil para gestionar tus solicitudes de soporte.';
  }

  get formDescription(): string {
    return 'Ingresa tus datos para acceder a tu cuenta.';
  }

  ngOnInit(): void {
    this.isRegister = this.route.snapshot.routeConfig?.path === 'register';
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const requestedProfile = params.get('profile');
      const previousProfile = this.profile;
      if (
        requestedProfile === 'admin' ||
        requestedProfile === 'executive' ||
        requestedProfile === 'client'
      ) {
        this.profile = requestedProfile;
      } else {
        this.profile = 'client';
      }
      if (this.profile !== previousProfile) {
        this.password = '';
        this.showPassword = false;
        this.error = '';
        this.success = '';
        this.newCaptcha();
      }
      this.updateProfileLabel();
    });
    this.newCaptcha();
  }

  async submit(): Promise<void> {
    this.error = '';
    this.success = '';
    const email = this.email.trim();
    if (!email || !this.password) {
      this.error = 'Ingresa tu correo y contraseña.';
      return;
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error = 'Ingresa un correo electrónico válido.';
      return;
    }
    if (this.isRegister) {
      const name = this.name.trim();
      const surname = this.surname.trim();
      if (!name || name.length > 100 || !surname || surname.length > 100) {
        this.error = 'Ingresa tu nombre completo.';
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
    }
    if (this.captchaAnswer !== this.captchaA + this.captchaB) {
      this.error = 'La respuesta de verificación no es correcta.';
      return;
    }
    this.busy = true;
    try {
      if (this.isRegister) {
        this.success = await this.auth.register(
          this.name.trim(),
          this.surname.trim(),
          email,
          this.password,
        );
        this.name = '';
        this.surname = '';
        this.password = '';
        this.confirmPassword = '';
      } else {
        const user = await this.auth.login(email, this.password);
        if (!this.matchesProfile(user)) {
          this.auth.clearSession();
          this.error = 'Esta cuenta no tiene acceso a este perfil.';
          return;
        }
        await this.router.navigate(['/dashboard', dashboardFor(user)]);
      }
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'No fue posible completar la solicitud.';
    } finally {
      this.busy = false;
      this.captchaAnswer = null;
      this.newCaptcha();
      this.changeDetector.markForCheck();
    }
  }

  newCaptcha(): void {
    this.captchaA = Math.floor(Math.random() * 8) + 2;
    this.captchaB = Math.floor(Math.random() * 8) + 1;
    this.captchaAnswer = null;
  }

  private matchesProfile(user: User): boolean {
    if (this.profile === 'client') return user.role === 'client';
    if (this.profile === 'admin') return user.role === 'admin';
    return ['executive', 'tech', 'soporte'].includes(user.role);
  }

  private updateProfileLabel(): void {
    this.profileLabel =
      this.profile === 'admin'
        ? 'Portal de administración'
        : this.profile === 'executive'
          ? 'Portal ejecutivo'
          : 'Portal de clientes';
  }

}
