import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iiqwbxjfmoajdfewlfuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpcXdieGpmbW9hamRmZXdsZnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODIwNzIsImV4cCI6MjA4NjU1ODA3Mn0.FQoVbEtlrRSH_HMB2fsmRfMTVAFHwip9P7_ejimJiK8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
    },
});
