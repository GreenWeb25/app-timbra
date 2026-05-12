import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let AsyncStorage = null;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

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
          console.log('Token trovato nel frammento URL');
          const { data, error } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: params.get('refresh_token'),
          });
          if (error) console.error('Errore nel settare la sessione:', error);
          return { data, error };
        }
      }
    } catch (err) {
      console.error('Errore nel parsing della sessione:', err);
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
