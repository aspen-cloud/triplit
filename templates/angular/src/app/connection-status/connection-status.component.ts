import { Component } from '@angular/core';
import { createConnectionStatus } from '@triplit/angular';
import { triplit } from '../../../triplit/client.js';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-connection-status',
  standalone: true,
  imports: [CommonModule],
  template: ` <div class="connection-status">
    <div class="{{ 'indicator ' + (status$ | async)?.toLowerCase() }}"></div>
    @if ((status$ | async) === 'CLOSED') {
      Offline
    } @else if ((status$ | async) === 'CONNECTING') {
      Connecting
    } @else {
      Online
    }
  </div>`,
})
export class ConnectionStatusComponent {
  status$ = createConnectionStatus(triplit);
}
