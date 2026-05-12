import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import { supabase, getSessionFromUrl } from '../services/supabaseClient';

const LoginScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                await getSessionFromUrl(supabase);
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) navigation.replace('Home');
                else setSessionLoading(false);
            } catch (err) {
                console.error('Errore init:', err);
                setSessionLoading(false);
            }
        };
        initAuth();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) navigation.replace('Home');
            else if (event === 'SIGNED_OUT') setSessionLoading(false);
        });
        return () => subscription?.unsubscribe();
    }, [navigation]);

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { 
                    redirectTo: 'https://webapp-timbra.netlify.app',
                    skipBrowserRedirect: false,
                },
            });
            console.log('OAuth data:', data);
            if (error) console.error('OAuth error:', error);
        } catch (error) {
            console.error('Catch error:', error);
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
                <Text style={styles.subtitle}>Accedi per iniziare</Text>
                <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.googleButtonText}>Accedi con Google</Text>}
                </TouchableOpacity>
                <Text style={styles.hint}>Usa il tuo account Google</Text>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
    content: { width: '100%', paddingHorizontal: 20, alignItems: 'center' },
    title: { fontSize: 36, fontWeight: 'bold', marginBottom: 10, color: '#333', fontFamily: 'SpaceMono-Bold' },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 40 },
    googleButton: { backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 8, marginBottom: 30, width: '100%', alignItems: 'center' },
    googleButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    hint: { color: '#999', fontSize: 12, textAlign: 'center' },
});

export default LoginScreen;
