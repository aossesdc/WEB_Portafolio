import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';

describe('HomePage', () => {
  it('presents real client actions and retains personnel access', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Tu soporte');
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));
    const client = links.find((link) => link.textContent?.includes('Ingresar como cliente'));
    expect(client?.getAttribute('href')).toBe('/login/client');
    expect(links.some((link) => link.getAttribute('href') === '/register')).toBe(true);
    expect(links.some((link) => link.getAttribute('href') === '/login/executive')).toBe(true);
    expect(links.some((link) => link.getAttribute('href') === '/login/admin')).toBe(true);
    expect(links.some((link) => link.getAttribute('href') === '/help')).toBe(true);
    expect(root.textContent).not.toContain('PostgreSQL');
    expect(root.textContent).not.toContain('datos de ejemplo');
    expect(links.some((link) => link.getAttribute('href')?.startsWith('/preview/'))).toBe(false);
  });
});
