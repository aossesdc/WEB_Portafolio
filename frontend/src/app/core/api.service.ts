import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { Account, AccountUpdate, AuthResponse, Branch, BranchDetails, Company, CompanyDetails, Contract, ContractDetails, ExecutiveTicketCreate, HardwareCategory, HardwareCategoryDetails, PersonnelDetails, PersonnelUser, RealTicket, RealTicketRisk, RealTicketStatus, ServiceType, ServiceTypeDetails, StaffAccountCreate, SupportPerson, TicketCategoryOption, TicketClientOption, TicketPriority, TicketSupportOption } from './models';

const API_URL = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${API_URL}/auth/login`, { email, password })
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  requestPasswordReset(email: string): Observable<{ ok: boolean; message: string }> {
    return this.http
      .post<{ ok: boolean; message: string }>(`${API_URL}/auth/password-reset`, { email })
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  confirmPasswordReset(uid: string, token: string, password: string): Observable<{ ok: boolean; message: string }> {
    return this.http
      .post<{ ok: boolean; message: string }>(`${API_URL}/auth/password-reset/confirm`, { uid, token, password })
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  register(
    name: string,
    surname: string,
    email: string,
    password: string,
  ): Observable<{ ok: boolean; message: string }> {
    return this.http
      .post<{ ok: boolean; message: string }>(`${API_URL}/auth/register`, {
        name,
        surname,
        email,
        password,
      })
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listAccounts(token: string): Observable<{ ok: boolean; accounts: Account[] }> {
    return this.http.get<{ ok: boolean; accounts: Account[] }>(`${API_URL}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createAccount(token: string, account: StaffAccountCreate): Observable<{ ok: boolean; account: Account }> {
    return this.http.post<{ ok: boolean; account: Account }>(`${API_URL}/accounts`, account, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateAccount(token: string, id: number, account: Partial<AccountUpdate>): Observable<{ ok: boolean; account: Account }> {
    return this.http.patch<{ ok: boolean; account: Account }>(`${API_URL}/accounts/${id}`, account, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deactivateAccount(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/accounts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listBranches(token: string): Observable<{ ok: boolean; branches: Branch[] }> {
    return this.http.get<{ ok: boolean; branches: Branch[] }>(`${API_URL}/branches`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createBranch(token: string, details: BranchDetails): Observable<{ ok: boolean; branch: Branch }> {
    return this.http.post<{ ok: boolean; branch: Branch }>(`${API_URL}/branches`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateBranch(token: string, id: number, details: Partial<BranchDetails & { active: boolean }>): Observable<{ ok: boolean; branch: Branch }> {
    return this.http.patch<{ ok: boolean; branch: Branch }>(`${API_URL}/branches/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteBranch(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/branches/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listCompanies(token: string): Observable<{ ok: boolean; companies: Company[] }> {
    return this.http.get<{ ok: boolean; companies: Company[] }>(`${API_URL}/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createCompany(token: string, details: Omit<CompanyDetails, 'user_id'>): Observable<{ ok: boolean; company: Company }> {
    return this.http.post<{ ok: boolean; company: Company }>(`${API_URL}/companies`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateCompany(token: string, id: number, details: Partial<CompanyDetails & { active: boolean }>): Observable<{ ok: boolean; company: Company }> {
    return this.http.patch<{ ok: boolean; company: Company }>(`${API_URL}/companies/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteCompany(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/companies/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listContracts(token: string): Observable<{ ok: boolean; contracts: Contract[] }> {
    return this.http.get<{ ok: boolean; contracts: Contract[] }>(`${API_URL}/contracts`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createContract(token: string, details: ContractDetails): Observable<{ ok: boolean; contract: Contract }> {
    return this.http.post<{ ok: boolean; contract: Contract }>(`${API_URL}/contracts`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateContract(token: string, id: number, details: Partial<ContractDetails>): Observable<{ ok: boolean; contract: Contract }> {
    return this.http.patch<{ ok: boolean; contract: Contract }>(`${API_URL}/contracts/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteContract(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/contracts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listServiceTypes(token: string): Observable<{ ok: boolean; service_types: ServiceType[] }> {
    return this.http.get<{ ok: boolean; service_types: ServiceType[] }>(`${API_URL}/service-types`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createServiceType(token: string, details: ServiceTypeDetails): Observable<{ ok: boolean; service_type: ServiceType }> {
    return this.http.post<{ ok: boolean; service_type: ServiceType }>(`${API_URL}/service-types`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateServiceType(token: string, id: number, details: Partial<ServiceTypeDetails & { active: boolean }>): Observable<{ ok: boolean; service_type: ServiceType }> {
    return this.http.patch<{ ok: boolean; service_type: ServiceType }>(`${API_URL}/service-types/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteServiceType(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/service-types/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listHardwareCategories(token: string): Observable<{ ok: boolean; categories: HardwareCategory[] }> {
    return this.http.get<{ ok: boolean; categories: HardwareCategory[] }>(`${API_URL}/hardware-categories`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createHardwareCategory(token: string, details: HardwareCategoryDetails): Observable<{ ok: boolean; category: HardwareCategory }> {
    return this.http.post<{ ok: boolean; category: HardwareCategory }>(`${API_URL}/hardware-categories`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateHardwareCategory(token: string, id: number, details: Partial<HardwareCategoryDetails & { active: boolean }>): Observable<{ ok: boolean; category: HardwareCategory }> {
    return this.http.patch<{ ok: boolean; category: HardwareCategory }>(`${API_URL}/hardware-categories/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteHardwareCategory(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/hardware-categories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listSupportPersonnel(token: string): Observable<{ ok: boolean; personnel: SupportPerson[] }> {
    return this.http.get<{ ok: boolean; personnel: SupportPerson[] }>(`${API_URL}/support-personnel`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listPersonnelUsers(token: string): Observable<{ ok: boolean; users: PersonnelUser[] }> {
    return this.http.get<{ ok: boolean; users: PersonnelUser[] }>(`${API_URL}/support-personnel/users`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createSupportPerson(token: string, details: PersonnelDetails): Observable<{ ok: boolean; person: SupportPerson }> {
    return this.http.post<{ ok: boolean; person: SupportPerson }>(`${API_URL}/support-personnel`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateSupportPerson(token: string, id: number, details: Partial<PersonnelDetails & { active: boolean }>): Observable<{ ok: boolean; person: SupportPerson }> {
    return this.http.patch<{ ok: boolean; person: SupportPerson }>(`${API_URL}/support-personnel/${id}`, details, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteSupportPerson(token: string, id: number): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${API_URL}/support-personnel/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  listTickets(token: string): Observable<{ ok: boolean; tickets: RealTicket[] }> {
    return this.http.get<{ ok: boolean; tickets: RealTicket[] }>(`${API_URL}/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  ticketCategories(token: string): Observable<{ ok: boolean; categories: TicketCategoryOption[] }> {
    return this.http.get<{ ok: boolean; categories: TicketCategoryOption[] }>(`${API_URL}/tickets/options`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  ticketPersonnel(token: string): Observable<{ ok: boolean; personnel: TicketSupportOption[] }> {
    return this.http.get<{ ok: boolean; personnel: TicketSupportOption[] }>(`${API_URL}/tickets/options`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  executiveTicketOptions(token: string): Observable<{ ok: boolean; categories: TicketCategoryOption[]; clients: TicketClientOption[]; duplicate_client_emails: boolean; personnel: TicketSupportOption[] }> {
    return this.http.get<{ ok: boolean; categories: TicketCategoryOption[]; clients: TicketClientOption[]; duplicate_client_emails: boolean; personnel: TicketSupportOption[] }>(`${API_URL}/tickets/options`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createTicket(token: string, data: { title: string; description: string; category_id: number }): Observable<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }> {
    return this.http.post<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }>(`${API_URL}/tickets`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  createExecutiveTicket(token: string, data: ExecutiveTicketCreate): Observable<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }> {
    return this.http.post<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }>(`${API_URL}/tickets`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateTicket(token: string, id: number, data: { status?: RealTicketStatus; priority?: TicketPriority; risk?: RealTicketRisk; support_person_id: number | null }): Observable<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }> {
    return this.http.patch<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }>(`${API_URL}/tickets/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  updateAssignedTicket(token: string, id: number, data: { status?: RealTicketStatus; resolution: string | null }): Observable<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }> {
    return this.http.patch<{ ok: boolean; ticket: RealTicket; notification_warning: string | null }>(`${API_URL}/tickets/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = error.error?.message
      || (error.status === 0
        ? 'No fue posible conectar con el servidor. Comprueba que el backend esté iniciado.'
        : 'Ocurrió un error al comunicarse con el servidor.');
    return throwError(() => new Error(message));
  }
}
