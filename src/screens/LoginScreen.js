import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    ScrollView,
    ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabaseClient';

WebBrowser.maybeCompleteAuthSession();

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop';

export default function LoginScreen({ navigation }) {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkCurrentSession();
    }, []);

    const checkCurrentSession = async () => {
        setLoading(true);
        try {
            const saved = await SecureStore.getItemAsync('dipendente_selezionato');
            if (saved) {
                const dip = JSON.parse(saved);
                navigation.replace('Home', { dipendente: dip });
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await handleUserLogin(session.user.email);
            }
        } catch (err) {
            console.log('Session check error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUserLogin = async (email) => {
        try {
            const { data: dip, error } = await supabase
                .from('dipendenti')
                .select('id, nome, ruolo, email')
                .eq('email', email)
                .single();

            if (error || !dip) {
                Alert.alert(
                    'Accesso Negato',
                    'La tua email non è registrata nel sistema. Contatta l\'amministratore.'
                );
                await supabase.auth.signOut();
                return;
            }

            await SecureStore.setItemAsync('dipendente_selezionato', JSON.stringify(dip));
            navigation.replace('Home', { dipendente: dip });
        } catch (error) {
            Alert.alert('Errore caricamento profilo', error.message);
        }
    };

    const signInWithGoogle = async () => {
        setLoading(true);
        try {
            const appRedirectUri = 'timbratura-app://auth-callback';
            console.log('Redirect URI:', appRedirectUri);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: appRedirectUri,
                    skipBrowserRedirect: true,
                },
            });

            if (error) throw error;
            if (!data?.url) throw new Error('Errore nella generazione dell\'URL di login');

            console.log('Auth URL generato:', data.url);

            const res = await WebBrowser.openAuthSessionAsync(data.url, appRedirectUri);

            console.log('Risultato WebBrowser:', res.type);

            if (res.type === 'success' && res.url) {
                const url = res.url;
                console.log('URL di ritorno:', url);

                const hashPart = url.split('#')[1] || url.split('?')[1] || '';
                const params = new URLSearchParams(hashPart);

                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (!accessToken) throw new Error('Token non trovato nell\'URL di ritorno');

                const { data: { session }, error: sessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken || '',
                });

                if (sessionError) throw sessionError;
                if (session?.user) await handleUserLogin(session.user.email);

            } else if (res.type === 'cancel') {
                console.log('Login annullato dall\'utente');
            }
        } catch (err) {
            console.error('Errore login:', err);
            Alert.alert('Errore Login', err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#22d3ee" />
                <Text style={styles.loadingText}>Verifica accesso...</Text>
            </View>
        );
    }

    return (
        <ImageBackground source={{ uri: BACKGROUND_IMAGE }} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.logo}>⏱</Text>
                        <Text style={styles.title}>Timbratura</Text>
                        <Text style={styles.subtitle}>Accedi per iniziare a timbrare</Text>
                    </View>

                    <View style={styles.content}>
                        <TouchableOpacity style={styles.googleBtn} onPress={signInWithGoogle}>
                            <Text style={styles.googleIcon}>G</Text>
                            <Text style={styles.googleBtnText}>Accedi con Google</Text>
                        </TouchableOpacity>

                        <Text style={styles.infoText}>
                            Usa il tuo account aziendale o Gmail autorizzata per accedere.
                        </Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1, backgroundColor: 'rgba(11, 17, 32, 0.88)' },
    scrollContent: { paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1120' },
    loadingText: { color: '#94a3b8', marginTop: 10 },
    header: { alignItems: 'center', paddingTop: 20, paddingBottom: 30 },
    logo: { fontSize: 60, marginBottom: 5 },
    title: { fontSize: 26, fontWeight: '800', color: '#f1f5f9' },
    subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
    content: { paddingHorizontal: 40, alignItems: 'center' },
    googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    googleIcon: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#4285F4',
        marginRight: 12,
    },
    googleBtnText: {
        color: '#1e293b',
        fontWeight: '700',
        fontSize: 16,
    },
    infoText: {
        color: '#475569',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 18,
    },
});