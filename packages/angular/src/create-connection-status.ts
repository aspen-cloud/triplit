import { TriplitClient, type ConnectionStatus } from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';
import { Observable } from 'rxjs';

export function createConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
): Observable<ConnectionStatus> {
  return new Observable((observer) => {
    const unsubscribe = client.onConnectionStatusChange((newStatus) => {
      observer.next(newStatus);
    }, true);
    return unsubscribe;
  });
}
