import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Company, Contract, ServiceType } from '../core/models';
import { ContractsComponent } from './contracts.component';

describe('ContractsComponent', () => {
  const company: Company = {
    id: 2, rut: '76.123.456-K', name: 'Empresa', business: null, address: null,
    email: 'empresa@example.com', phone: null, active: false, user_id: null,
  };
  const contract: Contract = {
    id: 1, code: 'CNT-2026-00001', company_id: 2, company_name: 'Empresa',
    service_type_id: 4, service_type_name: 'Redes',
    description: 'Soporte de redes seguro',
    start_date: '2026-01-01', end_date: '2026-12-31',
    coverage: '8x5', amount: '125.50', status: 'Activo',
  };
  const service: ServiceType = { id: 4, name: 'Redes', description: 'Soporte', priority: 'Media', active: false };
  let api: {
    listContracts: ReturnType<typeof vi.fn>;
    listCompanies: ReturnType<typeof vi.fn>;
    listServiceTypes: ReturnType<typeof vi.fn>;
    createContract: ReturnType<typeof vi.fn>;
    updateContract: ReturnType<typeof vi.fn>;
    deleteContract: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listContracts: vi.fn().mockReturnValue(of({ contracts: [contract] })),
      listCompanies: vi.fn().mockReturnValue(of({ companies: [company] })),
      listServiceTypes: vi.fn().mockReturnValue(of({ service_types: [service] })),
      createContract: vi.fn().mockReturnValue(of({ contract })),
      updateContract: vi.fn().mockReturnValue(of({ contract })),
      deleteContract: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [ContractsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('searches and registers without sending a code, and edits', async () => {
    const component = TestBed.createComponent(ContractsComponent).componentInstance;
    await component.load();
    for (const term of ['cnt-2026', 'empresa', 'redes', '8x5', 'activo']) {
      component.search.set(term);
      expect(component.filteredContracts()).toHaveLength(1);
    }
    component.search.set('no existe');
    expect(component.filteredContracts()).toHaveLength(0);
    await component.open(null);
    component.companyId = 2;
    component.startDate = '2026-01-01';
    component.endDate = '2026-12-31';
    component.description = 'Soporte continuo';
    component.serviceTypeId = 4;
    await component.save({ invalid: false } as NgForm);
    expect(api.createContract).toHaveBeenCalledWith('admin-token', expect.objectContaining({ company_id: 2, service_type_id: 4, amount: '0.00', description: 'Soporte continuo' }));
    expect(api.createContract.mock.calls[0][1]).not.toHaveProperty('code');
    await component.open(contract);
    expect(component.description).toBe('Soporte de redes seguro');
    expect(component.serviceTypeId).toBe(4);
    component.endDate = '2026-01-01';
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toContain('posterior');
    expect(api.updateContract).not.toHaveBeenCalled();
    component.endDate = '2027-01-01';
    component.description = 'Servicio actualizado';
    component.serviceTypeId = null;
    await component.save({ invalid: false } as NgForm);
    expect(api.updateContract).toHaveBeenCalledWith('admin-token', 1, expect.objectContaining({ service_type_id: null, end_date: '2027-01-01', description: 'Servicio actualizado' }));
  });

  it('confirms status changes and deletion, including expired contracts', async () => {
    const component = TestBed.createComponent(ContractsComponent).componentInstance;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.changeStatus(contract);
    await component.remove(contract);
    expect(api.updateContract).not.toHaveBeenCalled();
    expect(api.deleteContract).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.changeStatus(contract);
    expect(api.updateContract).toHaveBeenCalledWith('admin-token', 1, { status: 'Suspendido' });
    await component.changeStatus({ ...contract, status: 'Vencido' });
    expect(api.updateContract).toHaveBeenCalledWith('admin-token', 1, { status: 'Activo' });
    await component.remove(contract);
    expect(api.deleteContract).toHaveBeenCalledWith('admin-token', 1);
    confirm.mockRestore();
  });

  it('preserves the form on errors and labels inactive companies', async () => {
    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.contract-description')?.textContent).toContain('Soporte de redes seguro');
    await fixture.componentInstance.open(contract);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select[name="companyId"]')?.textContent).toContain('Empresa');
    expect(element.querySelector('select[name="companyId"]')?.textContent).toContain('inactiva');
    expect(element.querySelector('select[name="serviceTypeId"]')?.textContent).toContain('Redes (inactivo)');
    expect(element.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value).toBe('Soporte de redes seguro');
    api.updateContract.mockReturnValue(throwError(() => new Error('Error al guardar')));
    await fixture.componentInstance.save({ invalid: false } as NgForm);
    expect(fixture.componentInstance.error()).toBe('Error al guardar');
    expect(fixture.componentInstance.formOpen()).toBe(true);
  });

  it('reports company load errors without opening the form', async () => {
    const component = TestBed.createComponent(ContractsComponent).componentInstance;
    api.listCompanies.mockReturnValue(throwError(() => new Error('Error al cargar empresas')));
    await component.open(null);
    expect(component.formOpen()).toBe(false);
    expect(component.error()).toBe('Error al cargar empresas');
  });

  it('reports service type load errors without opening the form', async () => {
    const component = TestBed.createComponent(ContractsComponent).componentInstance;
    api.listServiceTypes.mockReturnValue(throwError(() => new Error('Error al cargar servicios')));
    await component.open(null);
    expect(component.formOpen()).toBe(false);
    expect(component.error()).toBe('Error al cargar servicios');
  });

  it('keeps an unavailable previously selected service until the user changes it', async () => {
    api.listServiceTypes.mockReturnValue(of({ service_types: [] }));
    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.open(contract);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select[name="serviceTypeId"]')?.textContent).toContain('ya no disponible');
    expect(fixture.componentInstance.serviceTypeId).toBe(4);
    await fixture.componentInstance.save({ invalid: false } as NgForm);
    expect(api.updateContract).toHaveBeenCalledWith('admin-token', 1, expect.objectContaining({ service_type_id: 4 }));
  });

  it('requires a valid description when editing an existing contract without one', async () => {
    const emptyContract = { ...contract, description: null };
    api.listContracts.mockReturnValue(of({ contracts: [emptyContract] }));
    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.contract-description')?.textContent).toContain('Sin descripción');
    await fixture.componentInstance.open(emptyContract);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.description).toBe('');
    await fixture.componentInstance.save({ invalid: false } as NgForm);
    expect(api.updateContract).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('15 letras');
  });

  it('rejects short descriptions without counting spaces, digits or punctuation', async () => {
    const component = TestBed.createComponent(ContractsComponent).componentInstance;
    await component.open(null);
    component.companyId = 2;
    component.startDate = '2026-01-01';
    component.endDate = '2026-12-31';
    for (const value of ['', '  ', 'abcdefghijklm n 12345!!!', 'á'.repeat(14)]) {
      component.description = value;
      await component.save({ invalid: false } as NgForm);
      expect(component.error()).toContain('15 letras');
      expect(api.createContract).not.toHaveBeenCalled();
    }
    component.description = 'abcde fghij klmno';
    await component.save({ invalid: false } as NgForm);
    expect(api.createContract).toHaveBeenCalledWith('admin-token', expect.objectContaining({ description: 'abcde fghij klmno' }));
    expect(('a\u0301'.repeat(15)).normalize('NFC')).toHaveLength(15);
    component.description = 'a\u0301'.repeat(15);
    expect(component.descriptionLetterCount).toBe(15);
  });

  it('submits the registration form with valid fields and a decimal amount', async () => {
    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.open(null);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector<HTMLSelectElement>('select[name="companyId"]')!;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    const description = element.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!;
    description.value = 'abcdefghijklm n 12345!!!';
    description.dispatchEvent(new Event('input'));
    for (const [name, value] of [['startDate', '2026-01-01'], ['endDate', '2026-12-31'], ['amount', '125.50']]) {
      const input = element.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    description.value = 'Servicio\nmensual';
    description.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
    element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(api.createContract).toHaveBeenCalledWith('admin-token', expect.objectContaining({ company_id: 2, amount: '125.50', description: 'Servicio\nmensual' }));
  });
});
