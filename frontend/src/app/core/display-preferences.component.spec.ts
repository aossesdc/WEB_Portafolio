import { TestBed } from '@angular/core/testing';
import { DisplayPreferencesComponent } from './display-preferences.component';

describe('DisplayPreferencesComponent', () => {
  beforeEach(() => {
    localStorage.removeItem('sla-text-size');
    localStorage.removeItem('sla-typography');
    localStorage.removeItem('sla-theme');
    document.documentElement.classList.remove('text-small', 'text-large');
    document.body.classList.remove('theme-dark');
  });

  afterEach(() => {
    localStorage.removeItem('sla-text-size');
    localStorage.removeItem('sla-typography');
    localStorage.removeItem('sla-theme');
    document.documentElement.classList.remove('text-small', 'text-large');
    document.body.classList.remove('theme-dark');
  });

  it('cycles normal, large, small and normal with one click per change', () => {
    const fixture = TestBed.createComponent(DisplayPreferencesComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toContain('normal');
    for (const [label, size, className] of [
      ['grande', 'large', 'text-large'],
      ['pequeño', 'small', 'text-small'],
      ['normal', 'normal', ''],
    ]) {
      button.click();
      fixture.detectChanges();
      expect(button.getAttribute('aria-label')).toContain(label);
      expect(localStorage.getItem('sla-text-size')).toBe(size);
      expect(document.documentElement.classList.contains('text-large')).toBe(className === 'text-large');
      expect(document.documentElement.classList.contains('text-small')).toBe(className === 'text-small');
    }
  });

  it('restores text size and maintains the independent theme control', () => {
    localStorage.setItem('sla-text-size', 'small');
    localStorage.setItem('sla-theme', 'light');
    const fixture = TestBed.createComponent(DisplayPreferencesComponent);
    fixture.detectChanges();
    expect(document.documentElement.classList.contains('text-small')).toBe(true);
    const theme = fixture.nativeElement.querySelector('.theme-toggle') as HTMLButtonElement;
    theme.click();
    fixture.detectChanges();
    expect(document.body.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('text-small')).toBe(true);
    expect(localStorage.getItem('sla-theme')).toBe('dark');
  });

  it('preserves previously enlarged text preferences', () => {
    localStorage.setItem('sla-typography', JSON.stringify({ heading: 'normal', body: 'extra-large' }));
    TestBed.createComponent(DisplayPreferencesComponent).detectChanges();
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
  });
});
