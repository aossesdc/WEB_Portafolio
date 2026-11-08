import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BranchesComponent } from './branches.component';

describe('BranchesComponent', () => {
  const branch = { id: 1, name: 'Centro', address: 'Alameda 123', commune: 'Santiago', region: 'Metropolitana', active: true };
  let api: {
    listBranches: ReturnType<typeof vi.fn>;
    createBranch: ReturnType<typeof vi.fn>;
    updateBranch: ReturnType<typeof vi.fn>;
    deleteBranch: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listBranches: vi.fn().mockReturnValue(of({ ok: true, branches: [branch] })),
      createBranch: vi.fn().mockReturnValue(of({ ok: true, branch })),
      updateBranch: vi.fn().mockReturnValue(of({ ok: true, branch })),
      deleteBranch: vi.fn().mockReturnValue(of({ ok: true })),
    };
    await TestBed.configureTestingModule({
      imports: [BranchesComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { token: () => 'admin-token' } },
      ],
    }).compileComponents();
  });

  it('loads, searches, creates, edits, changes state and confirms deletion', async () => {
    const component = TestBed.createComponent(BranchesComponent).componentInstance;
    await component.load();
    for (const term of ['CENTRO', 'alameda', 'santiago', 'metropolitana']) {
      component.search.set(term);
      expect(component.filteredBranches()).toHaveLength(1);
    }
    component.search.set('no existe');
    expect(component.filteredBranches()).toHaveLength(0);
    component.create();
    component.name = ' Centro ';
    component.address = branch.address;
    component.commune = branch.commune;
    component.region = 'Metropolitana de Santiago';
    await component.save({ invalid: false } as NgForm);
    expect(api.createBranch).toHaveBeenCalledWith('admin-token', {
      name: 'Centro', address: branch.address, commune: branch.commune, region: 'Metropolitana de Santiago',
    });
    component.edit(branch);
    component.name = 'Nuevo';
    await component.save({ invalid: false } as NgForm);
    expect(api.updateBranch).toHaveBeenCalledWith('admin-token', 1, expect.objectContaining({ name: 'Nuevo' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.remove(branch);
    expect(api.deleteBranch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setActive(branch);
    expect(api.updateBranch).toHaveBeenCalledWith('admin-token', 1, { active: false });
    await component.setActive({ ...branch, active: false });
    expect(api.updateBranch).toHaveBeenCalledWith('admin-token', 1, { active: true });
    await component.remove(branch);
    expect(api.deleteBranch).toHaveBeenCalledWith('admin-token', 1);
    confirm.mockRestore();
  });

  it('reports server errors and rejects whitespace-only input', async () => {
    const component = TestBed.createComponent(BranchesComponent).componentInstance;
    api.listBranches.mockReturnValue(throwError(() => new Error('Error al cargar')));
    await component.load();
    expect(component.error()).toBe('Error al cargar');
    component.create();
    component.name = '  ';
    component.address = 'Dirección';
    component.commune = 'Comuna';
    component.region = 'Región';
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toContain('no pueden contener solo espacios');
    expect(api.createBranch).not.toHaveBeenCalled();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteBranch.mockReturnValue(throwError(() => new Error('Sucursal vinculada')));
    await component.remove(branch);
    expect(component.error()).toBe('Sucursal vinculada');
    confirm.mockRestore();
  });

  it('opens the separate form and enforces field lengths', async () => {
    const fixture = TestBed.createComponent(BranchesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Registrar sucursal');
    button!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('input[name="name"]')?.getAttribute('maxlength')).toBe('150');
    expect(element.querySelector('input[name="address"]')?.getAttribute('maxlength')).toBe('255');
    expect(element.querySelector('select[name="commune"]')).not.toBeNull();
    expect(element.querySelector('select[name="region"]')).not.toBeNull();
    expect(element.querySelector('h2')?.textContent).toContain('Registrar sucursal');
  });

  it('covers all 16 regions and 346 communes and resets commune on region change', async () => {
    const component = TestBed.createComponent(BranchesComponent).componentInstance;
    expect(component.regions).toHaveLength(16);
    expect(component.regions.reduce((count, region) => count + region.communes.length, 0)).toBe(346);
    component.selectRegion('Metropolitana de Santiago');
    expect(component.communes).toContain('Santiago');
    expect(component.communes).toContain('Padre Hurtado');
    component.commune = 'Santiago';
    component.selectRegion('Valparaíso');
    expect(component.commune).toBe('');
    expect(component.communes).toContain('Viña del Mar');
    expect(component.communes).not.toContain('Santiago');
    component.name = 'Nueva';
    component.address = 'Dirección';
    component.commune = 'Santiago';
    await component.save({ invalid: false } as NgForm);
    expect(component.error()).toContain('correspondientes');
    expect(api.createBranch).not.toHaveBeenCalled();
  });

  it('preserves unrecognized existing locations when editing other fields', async () => {
    const component = TestBed.createComponent(BranchesComponent).componentInstance;
    component.edit(branch);
    expect(component.legacyRegion).toBe(true);
    expect(component.legacyCommune).toBe(true);
    component.name = 'Actualizada';
    await component.save({ invalid: false } as NgForm);
    expect(api.updateBranch).toHaveBeenCalledWith('admin-token', branch.id, expect.objectContaining({
      region: 'Metropolitana', commune: 'Santiago',
    }));
  });
});
