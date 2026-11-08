import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    const dark = localStorage.getItem('sla-theme') !== 'light';
    document.body.classList.toggle('theme-dark', dark);
  }
}
