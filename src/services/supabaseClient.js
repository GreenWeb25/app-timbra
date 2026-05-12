import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY;

export const getSessionFromUrl = async (supabaseClient) => {
  if (Platform.OS === 'web') {
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

const getStorage = () => {
  if (Platform.OS === 'web') {
    try {
      const test = '__localStorage_test__';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return window.localStorage;
    } catch {
      return window.sessionStorage;
    }
  }
  return AsyncStorage;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
