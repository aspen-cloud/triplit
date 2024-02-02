import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://dmghtipnbmxwqtzpuktx.supabase.co',
  process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtZ2h0aXBuYm14d3F0enB1a3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODE0OTA0MDUsImV4cCI6MTk5NzA2NjQwNX0.ZjFKaBx-RVqPr58TyCCQnCrcYgy3zGNUjoU_ZmJDeqI'
);
