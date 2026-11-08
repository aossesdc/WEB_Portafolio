import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HolidaysComponent } from './holidays.component';
import { AuthService } from '../core/auth.service';

const holiday = (id: number, date: string, title: string) => ({
  id, date, title, type: 'Civil', scope: 'Nacional', is_irrenunciable: false,
});

describe('HolidaysComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.removeItem('sla-holidays-year');
    await TestBed.configureTestingModule({
      imports: [HolidaysComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { token: () => 'admin-token' } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('sla-holidays-year');
  });

  it('filters Saturdays and Sundays and searches weekday holidays', async () => {
    const fixture = TestBed.createComponent(HolidaysComponent);
    fixture.detectChanges();
    const sync = http.expectOne('/api/holidays/sync');
    expect(sync.request.headers.get('Authorization')).toBe('Bearer admin-token');
    sync.flush({ ok: true, inserted: 1 });
    await fixture.whenStable();
    http.expectOne('/api/holidays').flush({ data: [
      holiday(1, '2026-05-01', 'Trabajo'),
      holiday(2, '2026-05-02', 'Sábado'),
      holiday(3, '2026-05-03', 'Domingo'),
      holiday(4, '2027-01-01', 'Año Nuevo'),
    ] });
    await fixture.whenStable();
    fixture.componentInstance.setYear('2026');
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleHolidays().map((h) => h.title)).toEqual(['Trabajo']);
    fixture.componentInstance.search.set('sin coincidencia');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay feriados que coincidan');
    fixture.componentInstance.search.set('TRABAJO');
    expect(fixture.componentInstance.visibleHolidays()).toHaveLength(1);
    expect(localStorage.getItem('sla-holidays-year')).toBe('2026');
    fixture.componentInstance.setYear('2027');
    expect(fixture.componentInstance.visibleHolidays()).toHaveLength(0);
    fixture.componentInstance.search.set('');
    expect(fixture.componentInstance.visibleHolidays().map((h) => h.title)).toEqual(['Año Nuevo']);
  });

  it('loads the stored year and reports unavailable API years', async () => {
    localStorage.setItem('sla-holidays-year', '2030');
    const fixture = TestBed.createComponent(HolidaysComponent);
    fixture.componentRef.setInput('preview', true);
    fixture.detectChanges();
    http.expectOne('/api/holidays').flush({ data: [holiday(1, '2026-05-01', 'Trabajo')] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.year()).toBe('2030');
    expect(fixture.nativeElement.textContent).toContain('No hay feriados guardados para este año.');
  });

  it('reports invalid responses and allows retry after an upstream error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fixture = TestBed.createComponent(HolidaysComponent);
    fixture.detectChanges();
    http.expectOne('/api/holidays/sync').flush({ ok: true });
    await fixture.whenStable();
    http.expectOne('/api/holidays').flush({ data: [{ date: 'invalid' }] });
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toContain('inválidos');
    const retry = fixture.componentInstance.load();
    http.expectOne('/api/holidays/sync').flush({ message: 'No fue posible sincronizar' }, { status: 502, statusText: 'Bad Gateway' });
    await Promise.resolve();
    http.expectOne('/api/holidays').flush({ data: [holiday(1, '2026-05-01', 'Trabajo')] });
    await retry;
    expect(fixture.componentInstance.error()).toContain('No fue posible');
    expect(fixture.componentInstance.holidays()).toHaveLength(1);
    const success = fixture.componentInstance.load();
    http.expectOne('/api/holidays/sync').flush({ ok: true });
    await Promise.resolve();
    http.expectOne('/api/holidays').flush({ data: [holiday(1, '2026-05-01', 'Trabajo')] });
    await success;
    expect(fixture.componentInstance.error()).toBe('');
  });
});
