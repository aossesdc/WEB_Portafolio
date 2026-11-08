from django.urls import path, re_path

from api import views
from api.holidays import holidays, sync_holidays
from api.branches import branches, branch_detail
from api.companies import companies, company_detail, company_clients
from api.contracts import contracts, contract_detail
from api.service_types import service_types, service_type_detail
from api.hardware_categories import hardware_categories, hardware_category_detail
from api.support_personnel import support_personnel, support_personnel_detail, support_personnel_users
from api.tickets import tickets, ticket_detail, ticket_options
from api.password_reset import request_password_reset, confirm_password_reset

urlpatterns = [
    path("health", views.health),
    path("api/status", views.api_status),
    path("api/changes", views.changes),
    path("api/holidays", holidays),
    path("api/holidays/sync", sync_holidays),
    path("api/auth/register", views.register),
    path("api/auth/login", views.login),
    path("api/auth/password-reset", request_password_reset),
    path("api/auth/password-reset/confirm", confirm_password_reset),
    path("api/accounts", views.accounts),
    path("api/accounts/<int:account_id>", views.account_detail),
    path("api/branches", branches),
    path("api/branches/<int:branch_id>", branch_detail),
    path("api/companies", companies),
    path("api/companies/clients", company_clients),
    path("api/companies/<int:company_id>", company_detail),
    path("api/contracts", contracts),
    path("api/contracts/<int:contract_id>", contract_detail),
    path("api/service-types", service_types),
    path("api/service-types/<int:service_type_id>", service_type_detail),
    path("api/hardware-categories", hardware_categories),
    path("api/hardware-categories/<int:category_id>", hardware_category_detail),
    path("api/support-personnel", support_personnel),
    path("api/support-personnel/users", support_personnel_users),
    path("api/support-personnel/<int:person_id>", support_personnel_detail),
    path("api/tickets/options", ticket_options),
    path("api/tickets", tickets),
    path("api/tickets/<int:ticket_id>", ticket_detail),
    path("api/maintainers/<str:module_key>", views.feature_unavailable),
    path("api/maintainers/<str:module_key>/<int:record_id>", views.feature_unavailable),
    re_path(r"^(?!api(?:/|$)|health$)(?P<asset_path>.*)$", views.frontend),
]
