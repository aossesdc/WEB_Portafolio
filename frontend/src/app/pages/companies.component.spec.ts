import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Company } from '../core/models';
import { CompaniesComponent } from './companies.component';

describe('CompaniesComponent', () => {
  const company: Company = {
    id: 1, rut: '76.123.456-K', name: 'Empresa', business: 'Servicios',
    address: null, email: 'contacto@example.com', phone: null, active: true, user_id: 2,
  };
  let api: {
    listCompanies: ReturnType<typeof vi.fn>;
    createCompany: ReturnType<typeof vi.fn>;
    updateCompany: ReturnType<typeof vi.fn>;
    deleteCompany: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listCompanies: vi.fn().mockReturnValue(of({ ok: true, companies: [company] })),
      createCompany: vi.fn().mockReturnValue(of({ ok: true, company })),
      updateCompany: vi.fn().mockReturnValue(of({ ok: true, company })),
      deleteCompany: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [CompaniesComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('loads, searches, creates, edits, changes status and confirms deletion', async () => {
    const component = TestBed.createComponent(CompaniesComponent).componentInstance;
    await component.load();
    for (const term of ['empresa', '76.123', 'contacto', 'servicios']) {
      component.search.set(term);
      expect(component.filteredCompanies()).toHaveLength(1);
    }
    component.search.set('no existe');
    expect(component.filteredCompanies()).toHaveLength(0);
    await component.open(null);
    component.rut = company.rut;
    component.name = company.name;
    component.email = company.email;
    await component.save({ invalid: false } as NgForm);
    expect(api.createCompany).toHaveBeenCalledWith('admin-token', expect.objectContaining({ rut: company.rut }));
    expect(api.createCompany.mock.calls.at(-1)?.[1]).not.toHaveProperty('user_id');
    await component.open(company);
    component.name = 'Nueva';
    await component.save({ invalid: false } as NgForm);
    expect(api.updateCompany).toHaveBeenCalledWith('admin-token', 1, expect.objectContaining({ name: 'Nueva' }));
    expect(api.updateCompany.mock.calls.at(-1)?.[2]).not.toHaveProperty('user_id');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.remove(company);
    expect(api.deleteCompany).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setActive(company);
    expect(api.updateCompany).toHaveBeenCalledWith('admin-token', 1, { active: false });
    await component.setActive({ ...company, active: false });
    expect(api.updateCompany).toHaveBeenCalledWith('admin-token', 1, { active: true });
    await component.remove(company);
    expect(api.deleteCompany).toHaveBeenCalledWith('admin-token', 1);
    confirm.mockRestore();
  });

  it('surfaces errors without closing the form', async () => {
    const component = TestBed.createComponent(CompaniesComponent).componentInstance;
    api.listCompanies.mockReturnValue(throwError(() => new Error('Error al cargar')));
    await component.load();
    expect(component.error()).toBe('Error al cargar');
    await component.open(company);
    api.updateCompany.mockReturnValue(throwError(() => new Error('RUT duplicado')));
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toBe('RUT duplicado');
    expect(component.formOpen()).toBe(true);
  });

  it('shows the company name field without a client selector', async () => {
    const fixture = TestBed.createComponent(CompaniesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Registrar empresa');
    button!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('input[name="rut"]')?.getAttribute('maxlength')).toBe('12');
    expect(element.querySelector('label[for="company-name"]')?.textContent).toContain('Nombre empresa');
    expect(element.querySelector('input[name="name"]')).not.toBeNull();
    expect(element.querySelector('select[name="userId"]')).toBeNull();
  });
});
