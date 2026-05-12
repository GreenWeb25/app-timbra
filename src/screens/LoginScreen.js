import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import { supabase, getSessionFromUrl } from '../services/supabaseClient';

const LoginScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            await getSessionFromUrl();
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) navigation.replace('Home');
            setSessionLoading(false);
        };
        checkSession();
    }, []);

    const handleLogin = async () => {
        setLoading(true);
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
    };

    if (sessionLoading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" /></SafeAreaView>;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Timbratura</Text>
                <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
                    <Text style={styles.btnText}>{loading ? 'Caricamento...' : 'Accedi con Google'}</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
    content: { width: '100%', paddingHorizontal: 20, alignItems: 'center' },
    title: { fontSize: 36, fontWeight: 'bold', marginBottom: 40, color: '#333' },
    btn: { backgroundColor: '#4285F4', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 8, width: '100%', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default LoginScreen;
