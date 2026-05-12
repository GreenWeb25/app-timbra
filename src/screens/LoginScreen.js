import React, { useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase, getSessionFromUrl } from '../services/supabaseClient';

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                // 🔧 DIAGNOSTICA
                console.log('📱 Platform:', Platform.OS);
                console.log('🔗 URL:', Platform.OS === 'web' ? window.location.href : 'Mobile');
                
                if (Platform.OS === 'web') {
                    console.log('📦 LocalStorage chiavi:', Object.keys(window.localStorage));
                    console.log('🔍 Hash URL:', window.location.hash);
                }

                // 1️⃣ Prova a estrarre token dal frammento URL (Safari fix)
                await getSessionFromUrl(supabase);

                // 2️⃣ Verifica sessione persistente
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error) {
                    console.error('❌ Errore nel recupero sessione:', error);
                }

                if (session?.user) {
                    console.log('✅ Sessione trovata - Redirect a Home');
                    navigation.replace('Home');
                } else {
                    console.log('🔄 Nessuna sessione - Mostra Login');
                    setSessionLoading(false);
                }
            } catch (err) {
                console.error('🚨 Errore inizializzazione auth:', err);
                setSessionLoading(false);
            }
        };

        initAuth();

        // Listener per i cambiamenti di autenticazione
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('🔔 Auth state changed:', event);
                
                if (event === 'SIGNED_IN' && session?.user) {
                    console.log('✅ Utente loggato:', session.user.email);
                    navigation.replace('Home');
                } else if (event === 'SIGNED_OUT') {
                    console.log('👋 Utente disconnesso');
                    setSessionLoading(false);
                }
            }
        );

        return () => {
            subscription?.unsubscribe();
        };
    }, [navigation]);

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            // Calcola il redirect URL dinamico
            const redirectUrl = Platform.OS === 'web' 
                ? `${window.location.origin}/auth-callback`
                : Linking.createURL('auth-callback');

            console.log('🔗 Redirect URL:', redirectUrl);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: Platform.OS !== 'web',
                },
            });

            if (error) {
                console.error('❌ Errore OAuth:', error);
                alert('Errore di accesso: ' + error.message);
            }

            // Web: il browser gestisce il redirect automaticamente
            if (Platform.OS === 'web') {
                console.log('🌐 Web - Redirect gestito dal browser');
            } else {
                // Mobile: usa WebBrowser per completare l'autenticazione
                if (data?.url) {
                    const result = await WebBrowser.openAuthSessionAsync(
                        data.url,
                        redirectUrl
                    );
                    
                    if (result.type === 'success') {
                        console.log('📱 Mobile OAuth Success');
                        // Estrai il token dal frammento URL
                        const url = result.url;
                        const hash = url.split('#')[1];
                        if (hash) {
                            await getSessionFromUrl(supabase);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('🚨 Errore login:', error);
            alert('Errore: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (sessionLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#0066cc" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Timbratura</Text>
                <Text style={styles.subtitle}>Accedi per iniziare a timbrare</Text>

                <TouchableOpacity
                    style={styles.googleButton}
                    onPress={handleGoogleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text style={styles.googleButtonText}>🔐 Accedi con Google</Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.hint}>
                    Usa il tuo account Google per accedere
                </Text>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    content: {
        width: '100%',
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
        fontFamily: 'SpaceMono-Bold',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 40,
    },
    googleButton: {
        backgroundColor: '#4285F4',
        paddingVertical: 14,
        paddingHorizontal: 30,
        borderRadius: 8,
        marginBottom: 30,
        width: '100%',
        alignItems: 'center',
    },
    googleButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    hint: {
        color: '#999',
        fontSize: 12,
        textAlign: 'center',
    },
});

export default LoginScreen;
