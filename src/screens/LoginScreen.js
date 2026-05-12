const handleGoogleLogin = async () => {
  setLoading(true);
  try {
    // 1. Configurazione dinamica del redirect
    const redirectTo = Platform.OS === 'web' 
      ? window.location.origin 
      : 'timbratura-app://auth-callback';

    console.log('Redirect URI impostato:', redirectTo);

    // 2. Chiamata a Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    
    // ... resto della tua logica (WebBrowser.openAuthSessionAsync ecc.)