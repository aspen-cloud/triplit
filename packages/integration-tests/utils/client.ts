import {
  ClientOptions,
  ClientSchema,
  Models,
  TriplitClient,
} from '@triplit/client';
import { Server as TriplitServer } from '@triplit/server-core';
import { TestTransport } from './test-transport.js';

export const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoidG9kb3MiLCJpYXQiOjE2OTY1MzMwMjl9.zAu3Coy49C4WSMKegE4NePHrCAtZ3B3_uJdDjTxu2NM';

export const NOT_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InRlc3QiLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6InRvZG9zIiwiaWF0IjoxNjk3NDc5MDI3fQ.8vkJawoLwsnTJK8_-zC3PCHjcb8zTK50SgYluQ3VYtM';

export function createTestClient<M extends Models<M> = Models>(
  server: TriplitServer,
  options: ClientOptions<M> = {}
) {
  return new TriplitClient<M>({
    storage: 'memory',
    transport: new TestTransport(server),
    logLevel: 'error',
    ...options,
  });
}

export type MessageLogItem = { direction: 'SENT' | 'RECEIVED'; message: any };
export type MessageLog = MessageLogItem[];
export function spyMessages<M extends Models<M> = Models>(
  client: TriplitClient<M>
) {
  const messages: MessageLog = [];
  client.onSyncMessageReceived((message) => {
    messages.push({ direction: 'RECEIVED', message });
  });
  client.onSyncMessageSent((message) => {
    messages.push({ direction: 'SENT', message });
  });
  return messages;
}

export function throwOnError(error: unknown) {
  throw error;
}

export function mapMessages(
  logs: MessageLog,
  callback: (message: MessageLogItem['message']) => any
) {
  return logs.map((log) => ({
    ...log,
    message: callback(log.message),
  }));
}
