export type UserRole = 'admin' | 'client' | 'executive' | 'tech' | 'soporte';

export interface User {
  id: number | string;
  name: string;
  email: string;
  profile: string;
  role: UserRole;
}

export interface AuthResponse {
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
  user: User;
}

export interface Account {
  id: number;
  email: string;
  role: UserRole;
  active: boolean;
  first_name?: string;
  last_name?: string;
  phone?: string;
  full_name?: string;
  employee_code?: string;
}

export interface AccountUpdate {
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  full_name?: string;
  employee_code?: string;
  active?: boolean;
}

export interface StaffAccountCreate extends AccountUpdate {
  role: 'admin' | 'ejecutivo' | 'soporte';
  password: string;
  full_name: string;
}

export interface BranchDetails {
  name: string;
  address: string;
  commune: string;
  region: string;
}

export interface Branch extends BranchDetails {
  id: number;
  active: boolean | null;
}

export interface CompanyDetails {
  rut: string;
  name: string;
  business: string | null;
  address: string | null;
  email: string;
  phone: string | null;
  user_id: number | null;
}

export interface Company extends CompanyDetails {
  id: number;
  active: boolean | null;
}

export type ContractStatus = 'Activo' | 'Vencido' | 'Suspendido';
export type ContractCoverage = '8x5' | '24x7';

export interface ContractDetails {
  company_id: number;
  service_type_id: number | null;
  description: string | null;
  start_date: string;
  end_date: string;
  coverage: ContractCoverage;
  amount: string;
  status: ContractStatus;
}

export interface Contract extends ContractDetails {
  id: number;
  code: string | null;
  company_name: string;
  service_type_name: string | null;
}

export type ServicePriority = 'Baja' | 'Media' | 'Alta' | 'Crítica';

export interface ServiceTypeDetails {
  name: string;
  description: string;
  priority: ServicePriority;
}

export interface ServiceType extends ServiceTypeDetails {
  id: number;
  active: boolean;
}

export interface HardwareCategoryDetails {
  name: string;
  description: string;
  service_type_id: number | null;
}

export interface HardwareCategory extends HardwareCategoryDetails {
  id: number;
  service_type_name: string | null;
  active: boolean;
}

export type PersonnelAvailability = 'Disponible' | 'Asignado' | 'En Terreno' | 'Licencia' | 'No Disponible';

export interface PersonnelUser {
  id: number;
  name: string;
  email: string;
  role: 'executive' | 'soporte';
  active: boolean | null;
}

export interface PersonnelDetails {
  user_id: number;
  branch_id: number;
  category_id: number | null;
  availability: PersonnelAvailability;
}

export interface SupportPerson extends PersonnelDetails {
  id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  user_active: boolean | null;
  branch_name: string;
  branch_active: boolean | null;
  category_name: string | null;
  active: boolean;
}

export type RealTicketStatus = 'Abierto' | 'Cerrado';
export type TicketPriority = 'Baja' | 'Media' | 'Alta' | 'Crítica';
export type RealTicketRisk = 'Bajo' | 'Medio' | 'Alto';
export interface RealTicket {
  id: number;
  code: string | null;
  title: string;
  description: string;
  category_id: number | null;
  category_name: string | null;
  status: RealTicketStatus | null;
  resolution?: string | null;
  client_name?: string;
  client_email?: string;
  priority?: TicketPriority | null;
  risk?: RealTicketRisk | null;
  support_person_id?: number | null;
  support_person_name?: string | null;
}
export interface TicketCategoryOption { id: number; name: string; }
export interface TicketClientOption { id: number; name: string; email: string; }
export interface ExecutiveTicketCreate {
  title: string;
  description: string;
  client_id: number;
  category_id: number | null;
  status: RealTicketStatus | null;
  priority: TicketPriority | null;
  risk: RealTicketRisk | null;
  support_person_id: number | null;
}
export interface TicketSupportOption {
  id: number;
  name: string;
  branch_name: string;
  user_active: boolean | null;
  availability: PersonnelAvailability;
}
