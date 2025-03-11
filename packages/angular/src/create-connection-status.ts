import { TriplitClient, type ConnectionStatus } from '@triplit/client';
import { Observable } from 'rxjs';

export function createConnectionStatus(
  client: TriplitClient<any>
): Observable<ConnectionStatus> {
  return new Observable((observer) => {
    const unsubscribe = client.onConnectionStatusChange((newStatus) => {
      observer.next(newStatus);
    }, true);
    return unsubscribe;
  });
}
