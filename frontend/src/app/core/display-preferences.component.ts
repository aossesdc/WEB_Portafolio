import { Component } from '@angular/core';

type FontSize = 'small' | 'normal' | 'large';

@Component({
  selector: 'app-display-preferences',
  template: `
    <div class="preferences">
      <button
        type="button"
        class="icon-button"
        (click)="cycleTextSize()"
        [attr.aria-label]="'Tamaño de texto: ' + sizeLabel + '. Cambiar tamaño'"
        [title]="'Tamaño de texto: ' + sizeLabel + '. Cambiar tamaño'"
      >Aa</button>
      <button
        type="button"
        class="icon-button theme-toggle"
        (click)="toggleTheme()"
        [attr.aria-label]="dark ? 'Activar modo claro' : 'Activar modo oscuro'"
        [title]="dark ? 'Activar modo claro' : 'Activar modo oscuro'"
      >{{ dark ? '☀' : '☾' }}</button>
      <span class="visually-hidden" aria-live="polite">Tamaño de texto: {{ sizeLabel }}</span>
    </div>
  `,
})
export class DisplayPreferencesComponent {
  dark = localStorage.getItem('sla-theme') !== 'light';
  size: FontSize = this.loadTextSize();

  constructor() {
    this.applyPreferences();
  }

  get sizeLabel(): string {
    return this.size === 'small' ? 'pequeño' : this.size === 'large' ? 'grande' : 'normal';
  }

  cycleTextSize(): void {
    this.size = this.size === 'small' ? 'normal' : this.size === 'normal' ? 'large' : 'small';
    localStorage.setItem('sla-text-size', this.size);
    this.applyPreferences();
  }

  toggleTheme(): void {
    this.dark = !this.dark;
    localStorage.setItem('sla-theme', this.dark ? 'dark' : 'light');
    this.applyPreferences();
  }

  private loadTextSize(): FontSize {
    const stored = localStorage.getItem('sla-text-size');
    if (stored === 'small' || stored === 'normal' || stored === 'large') return stored;

    const legacy = localStorage.getItem('sla-typography');
    if (!legacy) return 'normal';
    try {
      const preferences: { heading?: string; body?: string } = JSON.parse(legacy);
      return preferences.heading === 'large' || preferences.heading === 'extra-large'
        || preferences.body === 'large' || preferences.body === 'extra-large' ? 'large' : 'normal';
    } catch (error) {
      console.warn('Se descartaron preferencias de visualización inválidas.', error);
      localStorage.removeItem('sla-typography');
      return 'normal';
    }
  }

  private applyPreferences(): void {
    document.body.classList.toggle('theme-dark', this.dark);
    document.documentElement.classList.toggle('text-small', this.size === 'small');
    document.documentElement.classList.toggle('text-large', this.size === 'large');
    document.body.classList.remove('heading-large', 'heading-extra-large', 'body-large', 'body-extra-large');
  }
}
