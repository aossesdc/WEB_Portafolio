import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ServiceType } from '../core/models';
import { ServiceTypesComponent } from './service-types.component';

describe('ServiceTypesComponent', () => {
  const service: ServiceType = { id: 1, name: 'Redes', description: 'Soporte de redes', priority: 'Media', active: true };
  let api: {
    listServiceTypes: ReturnType<typeof vi.fn>;
    createServiceType: ReturnType<typeof vi.fn>;
    updateServiceType: ReturnType<typeof vi.fn>;
    deleteServiceType: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listServiceTypes: vi.fn().mockReturnValue(of({ service_types: [service] })),
      createServiceType: vi.fn().mockReturnValue(of({ service_type: service })),
      updateServiceType: vi.fn().mockReturnValue(of({ service_type: service })),
      deleteServiceType: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [ServiceTypesComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('searches and creates and edits service types', async () => {
    const component = TestBed.createComponent(ServiceTypesComponent).componentInstance;
    await component.load();
    for (const term of ['redes', 'soporte', 'media', 'activo']) {
      component.search.set(term);
      expect(component.filteredServiceTypes()).toHaveLength(1);
    }
    component.search.set('inexistente');
    expect(component.filteredServiceTypes()).toHaveLength(0);
    component.open(null);
    expect(component.priority).toBe('Media');
    component.name = 'Soporte';
    component.description = '  ';
    await component.save({ invalid: false } as NgForm);
    expect(api.createServiceType).not.toHaveBeenCalled();
    expect(component.error()).toContain('descripción');
    component.description = 'Atención remota';
    component.priority = 'Crítica';
    await component.save({ invalid: false } as NgForm);
    expect(api.createServiceType).toHaveBeenCalledWith('admin-token', { name: 'Soporte', description: 'Atención remota', priority: 'Crítica' });
    component.open(service);
    component.name = 'Nuevo nombre';
    await component.save({ invalid: false } as NgForm);
    expect(api.updateServiceType).toHaveBeenCalledWith('admin-token', 1, { name: 'Nuevo nombre', description: service.description, priority: 'Media' });
  });

  it('confirms status and deletion and shows failures', async () => {
    const component = TestBed.createComponent(ServiceTypesComponent).componentInstance;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.setActive(service);
    await component.remove(service);
    expect(api.updateServiceType).not.toHaveBeenCalled();
    expect(api.deleteServiceType).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setActive(service);
    expect(api.updateServiceType).toHaveBeenCalledWith('admin-token', 1, { active: false });
    await component.setActive({ ...service, active: false });
    expect(api.updateServiceType).toHaveBeenCalledWith('admin-token', 1, { active: true });
    api.deleteServiceType.mockReturnValue(throwError(() => new Error('Registro vinculado')));
    await component.remove(service);
    expect(component.error()).toBe('Registro vinculado');
    expect(component.serviceTypes()).toEqual([service]);
    confirm.mockRestore();
  });

  it('opens the separate form and keeps it open on save errors', async () => {
    const fixture = TestBed.createComponent(ServiceTypesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Registrar tipo de servicio');
    button!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('input[name="name"]')?.getAttribute('maxlength')).toBe('100');
    expect(element.querySelector('textarea[name="description"]')?.hasAttribute('required')).toBe(true);
    expect(element.querySelector('select[name="priority"]')?.textContent).toContain('Crítica');
    fixture.componentInstance.name = 'Redes';
    fixture.componentInstance.description = 'Descripción';
    api.createServiceType.mockReturnValue(throwError(() => new Error('Nombre duplicado')));
    await fixture.componentInstance.save({ invalid: false } as NgForm);
    expect(fixture.componentInstance.error()).toBe('Nombre duplicado');
    expect(fixture.componentInstance.formOpen()).toBe(true);
  });
});
