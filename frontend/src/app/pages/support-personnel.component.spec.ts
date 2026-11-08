import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Branch, HardwareCategory, PersonnelUser, SupportPerson } from '../core/models';
import { SupportPersonnelComponent } from './support-personnel.component';

describe('SupportPersonnelComponent', () => {
  const person: SupportPerson = {
    id: 1, user_id: 2, user_name: 'Ana Soporte', user_email: 'ana@example.com',
    user_role: 'soporte', user_active: false, branch_id: 5, branch_name: 'Centro',
    branch_active: false, category_id: 3, category_name: 'Equipos',
    availability: 'Disponible', active: true,
  };
  const user: PersonnelUser = { id: 2, name: 'Ana Soporte', email: 'ana@example.com', role: 'soporte', active: false };
  const branch: Branch = { id: 5, name: 'Centro', address: 'Alameda', commune: 'Santiago', region: 'Metropolitana', active: false };
  const category: HardwareCategory = {
    id: 3, name: 'Equipos', description: 'Equipos críticos', active: false,
    service_type_id: null, service_type_name: null,
  };
  let api: {
    listSupportPersonnel: ReturnType<typeof vi.fn>;
    listPersonnelUsers: ReturnType<typeof vi.fn>;
    listBranches: ReturnType<typeof vi.fn>;
    listHardwareCategories: ReturnType<typeof vi.fn>;
    createSupportPerson: ReturnType<typeof vi.fn>;
    updateSupportPerson: ReturnType<typeof vi.fn>;
    deleteSupportPerson: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listSupportPersonnel: vi.fn().mockReturnValue(of({ personnel: [person] })),
      listPersonnelUsers: vi.fn().mockReturnValue(of({ users: [user] })),
      listBranches: vi.fn().mockReturnValue(of({ branches: [branch] })),
      listHardwareCategories: vi.fn().mockReturnValue(of({ categories: [category] })),
      createSupportPerson: vi.fn().mockReturnValue(of({ person })),
      updateSupportPerson: vi.fn().mockReturnValue(of({ person })),
      deleteSupportPerson: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [SupportPersonnelComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('searches and registers or edits an optional category and availability', async () => {
    const component = TestBed.createComponent(SupportPersonnelComponent).componentInstance;
    await component.load();
    for (const term of ['ana', 'example.com', 'centro', 'equipos', 'disponible', 'activo']) {
      component.search.set(term);
      expect(component.filteredPersonnel()).toHaveLength(1);
    }
    component.search.set('no existe');
    expect(component.filteredPersonnel()).toHaveLength(0);
    await component.open(null);
    expect(component.isRegistered(user)).toBe(true);
    component.userId = 4;
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toContain('sucursal');
    expect(api.createSupportPerson).not.toHaveBeenCalled();
    component.branchId = 5;
    component.categoryId = null;
    component.availability = 'En Terreno';
    await component.save({ invalid: false } as NgForm);
    expect(api.createSupportPerson).toHaveBeenCalledWith('admin-token', {
      user_id: 4, branch_id: 5, category_id: null, availability: 'En Terreno',
    });
    await component.open(person);
    expect(component.isRegistered(user)).toBe(false);
    component.categoryId = null;
    component.branchId = 6;
    await component.save({ invalid: false } as NgForm);
    expect(api.updateSupportPerson).toHaveBeenCalledWith('admin-token', 1, {
      user_id: 2, branch_id: 6, category_id: null, availability: 'Disponible',
    });
  });

  it('labels inactive records and preserves a historical selection', async () => {
    const fixture = TestBed.createComponent(SupportPersonnelComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.open(person);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select[name="userId"]')?.textContent).toContain('cuenta inactiva');
    expect(element.querySelector('select[name="branchId"]')?.textContent).toContain('Centro (inactiva)');
    expect(element.querySelector('select[name="branchId"]')?.hasAttribute('required')).toBe(true);
    expect(element.querySelector('select[name="categoryId"]')?.textContent).toContain('inactiva');
    api.listPersonnelUsers.mockReturnValue(of({ users: [] }));
    fixture.componentInstance.cancel();
    await fixture.componentInstance.open(person);
    fixture.detectChanges();
    expect(element.querySelector('select[name="userId"]')?.textContent).toContain('cuenta existente no disponible');
    expect(fixture.componentInstance.userId).toBe(2);
  });

  it('keeps form data on failure and does not open when lookups fail', async () => {
    const component = TestBed.createComponent(SupportPersonnelComponent).componentInstance;
    api.listBranches.mockReturnValueOnce(throwError(() => new Error('Error al cargar sucursales')));
    await component.open(null);
    expect(component.formOpen()).toBe(false);
    expect(component.error()).toContain('Error al cargar sucursales');
    api.listHardwareCategories.mockReturnValueOnce(throwError(() => new Error('Error al cargar categorías')));
    await component.open(null);
    expect(component.formOpen()).toBe(false);
    expect(component.error()).toContain('Error al cargar categorías');
    await component.open(person);
    api.updateSupportPerson.mockReturnValueOnce(throwError(() => new Error('Cuenta ya registrada')));
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toBe('Cuenta ya registrada');
    expect(component.formOpen()).toBe(true);
    expect(component.userId).toBe(2);
    expect(component.branchId).toBe(5);
  });

  it('confirms activation and deletion without modifying the account', async () => {
    const component = TestBed.createComponent(SupportPersonnelComponent).componentInstance;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.setActive(person);
    await component.remove(person);
    expect(api.updateSupportPerson).not.toHaveBeenCalled();
    expect(api.deleteSupportPerson).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setActive(person);
    await component.setActive({ ...person, active: false });
    expect(api.updateSupportPerson).toHaveBeenCalledWith('admin-token', 1, { active: false });
    expect(api.updateSupportPerson).toHaveBeenCalledWith('admin-token', 1, { active: true });
    api.deleteSupportPerson.mockReturnValueOnce(throwError(() => new Error('Registro vinculado')));
    await component.remove(person);
    expect(component.error()).toBe('Registro vinculado');
    await component.remove(person);
    expect(api.deleteSupportPerson).toHaveBeenCalledWith('admin-token', 1);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('La cuenta se conservará'));
    confirm.mockRestore();
  });
});
