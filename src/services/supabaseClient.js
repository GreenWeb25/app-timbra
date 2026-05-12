import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY;

export const getSessionFromUrl = async (supabaseClient) => {
  if (typeof window !== 'undefined' && window.location) {
    try {
      const hash = window.location.hash.substring(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        if (accessToken) {
          const { data, error } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: params.get('refresh_token'),
          });
          return { data, error };
        }
      }
    } catch (err) {
      console.error('Errore parsing sessione:', err);
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: true,
  },
});
