import { Component } from '@angular/core';
import { injectConnectionStatus } from '@triplit/angular';
import { triplit } from '../../../triplit/client.js';

@Component({
  selector: 'app-connection-status',
  standalone: true,
  template: ` <div class="connection-status">
    <div class="{{ 'indicator ' + status().toLowerCase() }}"></div>
    @if (status() === 'CLOSED') {
      Offline
    } @else if (status() === 'CONNECTING') {
      Connecting
    } @else {
      Online
    }
  </div>`,
})
export class ConnectionStatusComponent {
  //@ts-ignore
  status = injectConnectionStatus(triplit);
}
