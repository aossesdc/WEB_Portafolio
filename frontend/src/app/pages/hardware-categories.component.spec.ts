import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { HardwareCategory, ServiceType } from '../core/models';
import { HardwareCategoriesComponent } from './hardware-categories.component';

describe('HardwareCategoriesComponent', () => {
  const service: ServiceType = { id: 2, name: 'Redes', description: 'Soporte', priority: 'Media', active: false };
  const category: HardwareCategory = {
    id: 1, name: 'Servidores', description: 'Equipos críticos', active: true,
    service_type_id: 2, service_type_name: 'Redes',
  };
  let api: {
    listHardwareCategories: ReturnType<typeof vi.fn>;
    listServiceTypes: ReturnType<typeof vi.fn>;
    createHardwareCategory: ReturnType<typeof vi.fn>;
    updateHardwareCategory: ReturnType<typeof vi.fn>;
    deleteHardwareCategory: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listHardwareCategories: vi.fn().mockReturnValue(of({ categories: [category] })),
      listServiceTypes: vi.fn().mockReturnValue(of({ service_types: [service] })),
      createHardwareCategory: vi.fn().mockReturnValue(of({ category })),
      updateHardwareCategory: vi.fn().mockReturnValue(of({ category })),
      deleteHardwareCategory: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [HardwareCategoriesComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('searches, creates, edits and removes the optional association', async () => {
    const component = TestBed.createComponent(HardwareCategoriesComponent).componentInstance;
    await component.load();
    for (const term of ['servidores', 'críticos', 'redes', 'activo']) {
      component.search.set(term);
      expect(component.filteredCategories()).toHaveLength(1);
    }
    component.search.set('no existe');
    expect(component.filteredCategories()).toHaveLength(0);
    await component.open(null);
    component.name = 'Routers';
    component.description = '  ';
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toContain('descripción');
    expect(api.createHardwareCategory).not.toHaveBeenCalled();
    component.description = 'Equipos de red';
    component.serviceTypeId = 2;
    await component.save({ invalid: false } as NgForm);
    expect(api.createHardwareCategory).toHaveBeenCalledWith('admin-token', {
      name: 'Routers', description: 'Equipos de red', service_type_id: 2,
    });
    await component.open(category);
    expect(component.serviceTypeId).toBe(2);
    component.serviceTypeId = null;
    await component.save({ invalid: false } as NgForm);
    expect(api.updateHardwareCategory).toHaveBeenCalledWith('admin-token', 1, expect.objectContaining({ service_type_id: null }));
  });

  it('confirms status and deletion, surfacing failures', async () => {
    const component = TestBed.createComponent(HardwareCategoriesComponent).componentInstance;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.setActive(category);
    await component.remove(category);
    expect(api.updateHardwareCategory).not.toHaveBeenCalled();
    expect(api.deleteHardwareCategory).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setActive(category);
    await component.setActive({ ...category, active: false });
    expect(api.updateHardwareCategory).toHaveBeenCalledWith('admin-token', 1, { active: false });
    expect(api.updateHardwareCategory).toHaveBeenCalledWith('admin-token', 1, { active: true });
    api.deleteHardwareCategory.mockReturnValueOnce(throwError(() => new Error('Registro vinculado')));
    await component.remove(category);
    expect(component.error()).toBe('Registro vinculado');
    expect(component.categories()).toEqual([category]);
    await component.remove(category);
    expect(api.deleteHardwareCategory).toHaveBeenCalledWith('admin-token', 1);
    confirm.mockRestore();
  });

  it('shows inactive service and retains the form on failure', async () => {
    const fixture = TestBed.createComponent(HardwareCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.open(category);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[name="name"]')?.getAttribute('maxlength')).toBe('100');
    expect(element.querySelector('textarea[name="description"]')?.hasAttribute('required')).toBe(true);
    expect(element.querySelector('select[name="serviceTypeId"]')?.textContent).toContain('Redes (inactivo)');
    api.updateHardwareCategory.mockReturnValue(throwError(() => new Error('Nombre duplicado')));
    await fixture.componentInstance.save({ invalid: false } as NgForm);
    expect(fixture.componentInstance.error()).toBe('Nombre duplicado');
    expect(fixture.componentInstance.formOpen()).toBe(true);
  });

  it('reports a service-list error without opening the form', async () => {
    const component = TestBed.createComponent(HardwareCategoriesComponent).componentInstance;
    api.listServiceTypes.mockReturnValue(throwError(() => new Error('No se pudieron cargar servicios')));
    await component.open(null);
    expect(component.formOpen()).toBe(false);
    expect(component.error()).toContain('cargar servicios');
  });

  it('keeps an unavailable existing selection visible', async () => {
    api.listServiceTypes.mockReturnValue(of({ service_types: [] }));
    const fixture = TestBed.createComponent(HardwareCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.open(category);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select[name="serviceTypeId"]')?.textContent).toContain('ya no disponible');
    expect(fixture.componentInstance.serviceTypeId).toBe(2);
  });
});
