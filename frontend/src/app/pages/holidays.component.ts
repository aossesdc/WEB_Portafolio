import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';

interface Holiday {
  id: number;
  date: string;
  title: string;
  type: string;
  is_irrenunciable: boolean;
}

const YEAR_KEY = 'sla-holidays-year';

function isHoliday(value: unknown): value is Holiday {
  if (!value || typeof value !== 'object') return false;
  const h = value as Record<string, unknown>;
  if (typeof h['id'] !== 'number' || typeof h['date'] !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(h['date']) || typeof h['title'] !== 'string'
    || typeof h['type'] !== 'string' || typeof h['is_irrenunciable'] !== 'boolean') return false;
  const date = new Date(`${h['date']}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === h['date'];
}

@Component({
  selector: 'app-holidays',
  imports: [FormsModule],
  templateUrl: './views/holidays.component.html',
  styleUrls: ['./views/accounts.component.css', './views/holidays.component.css'],
})
export class HolidaysComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly preview = input(false);
  readonly holidays = signal<Holiday[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly storageWarning = signal('');
  readonly search = signal('');
  readonly year = signal(String(new Date().getFullYear()));
  readonly years = computed(() => [...new Set(this.holidays().map((h) => h.date.slice(0, 4)))].sort());
  readonly visibleHolidays = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('es');
    return this.holidays().filter((holiday) => {
      const day = new Date(`${holiday.date}T00:00:00Z`).getUTCDay();
      const searchable = [holiday.title, holiday.type];
      return day !== 0 && day !== 6 && holiday.date.startsWith(`${this.year()}-`)
        && (!search || searchable.some((value) => value.toLocaleLowerCase('es').includes(search)));
    }).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  });

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem(YEAR_KEY);
      if (stored && /^\d{4}$/.test(stored)) this.year.set(stored);
    } catch (error) {
      console.warn('No se pudo leer el año guardado de feriados.', error);
      this.storageWarning.set('No se pudo leer el año guardado en este navegador.');
    }
    void this.load();
  }

  setYear(year: string): void {
    this.year.set(year);
    try {
      localStorage.setItem(YEAR_KEY, year);
      this.storageWarning.set('');
    } catch (error) {
      console.warn('No se pudo guardar el año de feriados.', error);
      this.storageWarning.set('No se pudo guardar el año en este navegador.');
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    if (!this.preview()) {
      try {
        const token = this.auth.token();
        if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
        await firstValueFrom(this.http.post('/api/holidays/sync', {}, {
          headers: { Authorization: `Bearer ${token}` },
        }));
      } catch (error) {
        console.error('Error al sincronizar feriados.', error);
        const message = error instanceof HttpErrorResponse ? error.error?.message : undefined;
        this.error.set(typeof message === 'string' ? message : 'No fue posible sincronizar los feriados. Se muestran los datos guardados, si están disponibles.');
      }
    }
    try {
      const response = await firstValueFrom(this.http.get<unknown>('/api/holidays'));
      if (!response || typeof response !== 'object' || !('data' in response)
        || !Array.isArray(response.data) || !response.data.every(isHoliday)) {
        throw new Error('La API entregó datos de feriados inválidos.');
      }
      this.holidays.set(response.data);
    } catch (error) {
      console.error('Error al consultar feriados.', error);
      this.error.set(error instanceof HttpErrorResponse
        ? 'No fue posible consultar los feriados guardados. Intenta actualizar nuevamente.'
        : error instanceof Error ? error.message : 'No fue posible consultar los feriados guardados.');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(date: string): string {
    return date.split('-').reverse().join('/');
  }
}
