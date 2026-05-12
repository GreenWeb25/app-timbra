const redirectTo = Platform.OS === 'web' 
  ? window.location.origin 
  : 'timbratura-app://auth-callback';

const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: redirectTo, // ORA È DINAMICO!
    skipBrowserRedirect: true,
  },
});