import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DisplayPreferencesComponent } from '../core/display-preferences.component';
import { dashboardFor } from '../core/dashboard-route';

@Component({
  imports: [DisplayPreferencesComponent, RouterLink],
  templateUrl: './views/help.page.html',
  styleUrl: './views/help.page.css',
})
export class HelpPage {
  private readonly auth = inject(AuthService);

  get homeRoute(): string[] {
    const user = this.auth.user();
    if (!user) return ['/'];
    return ['/dashboard', dashboardFor(user)];
  }
}
