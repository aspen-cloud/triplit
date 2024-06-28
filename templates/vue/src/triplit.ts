import { TriplitClient } from '@triplit/client';
import { schema } from '../triplit/schema';

export const client = new TriplitClient({
  schema,
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6ImFub24iLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6ImxvY2FsLXByb2plY3QtaWQifQ.JzN7Erur8Y-MlFdCaZtovQwxN_m_fSyOIWNzYQ3uVcc',
  serverUrl: 'http://localhost:6543',
});
window.triplit = client;
