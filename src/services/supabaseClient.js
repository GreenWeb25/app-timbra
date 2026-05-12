import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Recupera le chiavi sia da Expo (Mobile) che da process.env (Web/Netlify)
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Usa il localStorage sul web e AsyncStorage sull'app
    storage: Platform.OS === 'web' ? window.localStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
