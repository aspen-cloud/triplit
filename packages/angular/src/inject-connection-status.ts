import { TriplitClient, type ConnectionStatus } from '@triplit/client';
import { assertInjector } from './util/assert-injector';
import { Injector, signal, DestroyRef, Signal, inject } from '@angular/core';

export function injectConnectionStatus(
  client: TriplitClient<any>,
  injector?: Injector
): Signal<ConnectionStatus> {
  return assertInjector(injectConnectionStatus, injector, () => {
    const result = signal<ConnectionStatus>('CONNECTING');
    const unsubscribe = client.onConnectionStatusChange((status) => {
      result.set(status);
    });
    inject(DestroyRef).onDestroy(unsubscribe);
    return result;
  });
}
