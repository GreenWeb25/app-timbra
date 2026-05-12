import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSessionFromUrl = async () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      if (access_token) {
        await supabase.auth.setSession({
          access_token,
          refresh_token: params.get('refresh_token'),
        });
      }
    }
  }
};
