import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DisplayPreferencesComponent } from '../core/display-preferences.component';

@Component({
  imports: [DisplayPreferencesComponent, RouterLink],
  templateUrl: './views/home.page.html',
  styleUrl: './views/home.page.css',
})
export class HomePage {}
