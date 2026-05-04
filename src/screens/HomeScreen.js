import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
    ImageBackground,
} from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabaseClient';

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop';

export default function HomeScreen({ route, navigation }) {
    const { dipendente } = route.params;

    const [cantieri, setCantieri] = useState([]);
    const [selectedCantiere, setSelectedCantiere] = useState(null);
    const [presenzaAperta, setPresenzaAperta] = useState(null); // riga GC con ora_fine = null
    const [ultimaPresenza, setUltimaPresenza] = useState(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [orarioCorrente, setOrarioCorrente] = useState('');
    const [inPausa, setInPausa] = useState(false);

    // Aggiorna orologio ogni secondo
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setOrarioCorrente(
                now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            );
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    const loadData = useCallback(async () => {
        // Carica cantieri
        const { data: cants } = await supabase.from('cantieri').select('id, nome').order('nome');
        setCantieri(cants || []);

        // Cerca se c'è una presenza aperta oggi (ora_fine = null, oggi)
        const oggi = new Date().toISOString().split('T')[0];
        const { data: pres } = await supabase
            .from('gestione_cantiere')
            .select('*')
            .eq('dipendente_id', dipendente.id)
            .eq('data', oggi)
            .is('ora_fine', null)
            .order('created_at', { ascending: false })
            .limit(1);

        if (pres && pres.length > 0) {
            setPresenzaAperta(pres[0]);
            setSelectedCantiere(pres[0].cantiere_id);
            setInPausa(!!pres[0].pausa_inizio);
        } else {
            setPresenzaAperta(null);
            setInPausa(false);
            // Ultima presenza chiusa
            const { data: ultima } = await supabase
                .from('gestione_cantiere')
                .select('*, cantieri(nome)')
                .eq('dipendente_id', dipendente.id)
                .not('ora_fine', 'is', null)
                .order('data', { ascending: false })
                .limit(1);
            setUltimaPresenza(ultima?.[0] || null);
        }
    }, [dipendente.id]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Richiede permesso location e restituisce coords
    const getLocation = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permesso negato', 'Per timbrare serve la localizzazione GPS.');
            return null;
        }
        try {
            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Highest,
                timeout: 15000
            });

            if (loc.coords.accuracy > 25) {
                Alert.alert(
                    'Precisione GPS bassa',
                    `Il segnale GPS è debole (precisione: ${Math.round(loc.coords.accuracy)}m). Per favore, spostati all'esterno o in un punto più aperto per una timbratura corretta.`
                );
            }

            const [addr] = await Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
            });

            // Formattazione: Via/Piazza, Numero Civico, Città
            const via = addr.street || addr.name || '';
            const civico = addr.streetNumber || '';
            const citta = addr.city || addr.region || '';

            const indirizzoStr = `${via}${civico ? ' ' + civico : ''}, ${citta}`.trim().replace(/^, /, '');

            return { lat: loc.coords.latitude, lng: loc.coords.longitude, indirizzo: indirizzoStr };
        } catch (e) {
            Alert.alert('Errore GPS', 'Non è stato possibile rilevare la tua posizione. Assicurati che il GPS sia attivo.');
            return null;
        }
    };

    const timbraEntrata = async () => {
        if (!selectedCantiere) {
            Alert.alert('Attenzione', 'Seleziona prima un cantiere.');
            return;
        }
        setLoading(true);
        const geo = await getLocation();
        const adesso = new Date().toISOString();
        const oggi = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('gestione_cantiere')
            .insert([{
                dipendente_id: dipendente.id,
                cantiere_id: selectedCantiere,
                data: oggi,
                ora_inizio: adesso,
                ore_lavorate: 0,
                timbrata_da_app: true,
                latitudine: geo?.lat || null,
                longitudine: geo?.lng || null,
                indirizzo_rilevato: geo?.indirizzo || null,
                note: `Entrata via app${geo?.indirizzo ? ' @ ' + geo.indirizzo : ''}`,
                minuti_pausa: 0
            }])
            .select()
            .single();

        setLoading(false);
        if (error) {
            Alert.alert('Errore', error.message);
        } else {
            setPresenzaAperta(data);
        }
    };

    const iniziaPausa = async () => {
        if (!presenzaAperta || inPausa) return;
        setLoading(true);
        const adesso = new Date().toISOString();
        const { error } = await supabase
            .from('gestione_cantiere')
            .update({ pausa_inizio: adesso })
            .eq('id', presenzaAperta.id);

        setLoading(false);
        if (error) {
            Alert.alert('Errore', error.message);
        } else {
            setInPausa(true);
            loadData();
        }
    };

    const finePausa = async () => {
        if (!presenzaAperta || !inPausa) return;
        setLoading(true);
        const adesso = new Date();
        const inizioPausa = new Date(presenzaAperta.pausa_inizio);
        const diffMinuti = Math.round((adesso - inizioPausa) / 60000);
        const nuoviMinuti = (presenzaAperta.minuti_pausa || 0) + diffMinuti;

        const { error } = await supabase
            .from('gestione_cantiere')
            .update({
                pausa_inizio: null,
                minuti_pausa: nuoviMinuti
            })
            .eq('id', presenzaAperta.id);

        setLoading(false);
        if (error) {
            Alert.alert('Errore', error.message);
        } else {
            setInPausa(false);
            loadData();
            Alert.alert('☕ Pausa terminata', `Hai ripreso il lavoro. Durata pausa totale: ${nuoviMinuti} min.`);
        }
    };

    const timbraUscita = async () => {
        if (!presenzaAperta) return;
        if (inPausa) {
            Alert.alert('Attenzione', 'Devi prima terminare la pausa per timbrare l\'uscita.');
            return;
        }
        setLoading(true);
        const geo = await getLocation();
        const adesso = new Date();
        const oraInizio = new Date(presenzaAperta.ora_inizio);
        const minutiPausa = presenzaAperta.minuti_pausa || 0;

        // Calcolo: (Tempo totale - Tempo pausa) / 3600000ms
        const oreLavorate = Math.max(0, Math.round(((adesso - oraInizio - (minutiPausa * 60000)) / 3600000) * 100) / 100);

        const { error } = await supabase
            .from('gestione_cantiere')
            .update({
                ora_fine: adesso.toISOString(),
                ore_lavorate: oreLavorate,
                note: presenzaAperta.note + ` | Uscita ${adesso.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} (Pausa: ${minutiPausa}m)`,
            })
            .eq('id', presenzaAperta.id);

        setLoading(false);
        if (error) {
            Alert.alert('Errore', error.message);
        } else {
            setPresenzaAperta(null);
            loadData();
            Alert.alert('✅ Uscita registrata!', `Ore lavorate oggi (al netto delle pause): ${oreLavorate.toFixed(2)}h`);
        }
    };

    const logout = async () => {
        Alert.alert('Esci', 'Vuoi disconnettere il tuo account Google?', [
            { text: 'Annulla', style: 'cancel' },
            {
                text: 'Sì, esci',
                style: 'destructive',
                onPress: async () => {
                    await SecureStore.deleteItemAsync('dipendente_selezionato');
                    await supabase.auth.signOut();
                    navigation.replace('Login');
                },
            },
        ]);
    };

    const dataDiOggi = new Date().toLocaleDateString('it-IT', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    const oreTrascorse = presenzaAperta
        ? Math.round(((new Date() - new Date(presenzaAperta.ora_inizio) - ((presenzaAperta.minuti_pausa || 0) * 60000)) / 3600000) * 100) / 100
        : null;

    return (
        <ImageBackground source={{ uri: BACKGROUND_IMAGE }} style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22d3ee" />}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                        <Text style={styles.logoutText}>↩ Cambia</Text>
                    </TouchableOpacity>
                    <View style={styles.avatarLg}>
                        <Text style={styles.avatarLgText}>{dipendente.nome[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.nomeOp}>{dipendente.nome}</Text>
                    <Text style={styles.ruoloOp}>{dipendente.ruolo || 'Operaio'}</Text>
                    <Text style={styles.orologio}>{orarioCorrente}</Text>
                    <Text style={styles.data}>{dataDiOggi}</Text>
                </View>

                {/* Stato badge */}
                <View style={[styles.badge, presenzaAperta ? (inPausa ? styles.badgePause : styles.badgeIn) : styles.badgeOut]}>
                    <Text style={styles.badgeText}>
                        {presenzaAperta
                            ? (inPausa ? '☕ IN PAUSA' : '🟢 SEI AL LAVORO')
                            : '🔴 NON ANCORA TIMBRATO'}
                    </Text>
                    {presenzaAperta && oreTrascorse !== null && (
                        <Text style={styles.oreTrascorse}>⏱ {oreTrascorse.toFixed(2)}h lavorate finora</Text>
                    )}
                    {presenzaAperta && presenzaAperta.minuti_pausa > 0 && (
                        <Text style={styles.pausaInfo}>☕ Pausa accumulata: {presenzaAperta.minuti_pausa} min</Text>
                    )}
                    {presenzaAperta && presenzaAperta.indirizzo_rilevato && (
                        <Text style={styles.geoText}>📍 {presenzaAperta.indirizzo_rilevato}</Text>
                    )}
                </View>

                {/* Seleziona cantiere (solo se non in servizio) */}
                {!presenzaAperta && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Seleziona Cantiere</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cantiereRow}>
                            {cantieri.map((c) => (
                                <TouchableOpacity
                                    key={c.id}
                                    style={[styles.cantiereChip, selectedCantiere === c.id && styles.cantiereChipSel]}
                                    onPress={() => setSelectedCantiere(c.id)}
                                >
                                    <Text style={[styles.cantiereChipText, selectedCantiere === c.id && styles.cantiereChipTextSel]}>
                                        🏗️ {c.nome}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Pulsanti principali */}
                <View style={{ paddingHorizontal: 20 }}>
                    {loading ? (
                        <ActivityIndicator size="large" color="#22d3ee" style={{ marginVertical: 32 }} />
                    ) : presenzaAperta ? (
                        <>
                            {inPausa ? (
                                <TouchableOpacity style={[styles.timbraBtn, styles.finePausaBtn]} onPress={finePausa}>
                                    <Text style={styles.timbraBtnIcon}>▶️</Text>
                                    <Text style={styles.timbraBtnText}>FINE PAUSA</Text>
                                    <Text style={styles.timbraBtnSub}>Riprendi a contare le ore</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={[styles.timbraBtn, styles.pausaBtn]} onPress={iniziaPausa}>
                                    <Text style={styles.timbraBtnIcon}>☕</Text>
                                    <Text style={styles.timbraBtnText}>INIZIA PAUSA</Text>
                                    <Text style={styles.timbraBtnSub}>Ferma temporaneamente il timer</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={[styles.timbraBtn, styles.timbraUscita]} onPress={timbraUscita}>
                                <Text style={styles.timbraBtnIcon}>🏠</Text>
                                <Text style={styles.timbraBtnText}>TIMBRA USCITA</Text>
                                <Text style={styles.timbraBtnSub}>Registra fine giornata</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity style={[styles.timbraBtn, styles.timbraEntrata]} onPress={timbraEntrata}>
                            <Text style={styles.timbraBtnIcon}>📍</Text>
                            <Text style={styles.timbraBtnText}>TIMBRA ENTRATA</Text>
                            <Text style={styles.timbraBtnSub}>Geolocalizza e registra inizio</Text>
                        </TouchableOpacity>
                    )}

                    {/* Bottone Costo Materiale sempre visibile */}
                    <TouchableOpacity
                        style={[styles.smallBtn, styles.materialBtn]}
                        onPress={() => navigation.navigate('CostoMateriale', { dipendente })}
                    >
                        <Text style={styles.smallBtnText}>📸 AGGIUNGI COSTO MATERIALE</Text>
                    </TouchableOpacity>

                    {/* Bottone Nota Spese */}
                    <TouchableOpacity
                        style={[styles.smallBtn, styles.notaSpeseBtn]}
                        onPress={() => navigation.navigate('NotaSpese', { dipendente })}
                    >
                        <Text style={styles.smallBtnText}>💳 REGISTRA NOTA SPESE (AI)</Text>
                    </TouchableOpacity>

                    {/* Bottone Rapportino */}
                    <TouchableOpacity
                        style={[styles.smallBtn, styles.rapportinoBtn]}
                        onPress={() => {
                            const cantiere = cantieri.find(c => c.id === (presenzaAperta?.cantiere_id || selectedCantiere));
                            if (!cantiere) {
                                Alert.alert('Attenzione', 'Seleziona un cantiere prima di compilare il rapportino.');
                                return;
                            }
                            navigation.navigate('Rapportino', {
                                dipendente,
                                cantiere,
                                presenzaId: presenzaAperta?.id || null,
                                oreLavorate: presenzaAperta ? oreTrascorse : null,
                            });
                        }}
                    >
                        <Text style={[styles.smallBtnText, { color: '#f59e0b' }]}>📋 COMPILA RAPPORTINO</Text>
                    </TouchableOpacity>
                </View>

                {/* Ultima presenza chiusa */}
                {!presenzaAperta && ultimaPresenza && (
                    <View style={styles.ultimaCard}>
                        <Text style={styles.ultimaTitle}>Ultima presenza</Text>
                        <Text style={styles.ultimaData}>
                            {new Date(ultimaPresenza.data).toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                        </Text>
                        <Text style={styles.ultimaOre}>{Number(ultimaPresenza.ore_lavorate).toFixed(2)}h lavorate</Text>
                        {ultimaPresenza.cantieri?.nome && (
                            <Text style={styles.ultimaCantiere}>🏗️ {ultimaPresenza.cantieri.nome}</Text>
                        )}
                    </View>
                )}

                {/* Link storico */}
                <TouchableOpacity style={styles.storicoBtn} onPress={() => navigation.navigate('Storico', { dipendente })}>
                    <Text style={styles.storicoBtnText}>📋 Vedi storico presenze</Text>
                </TouchableOpacity>
            </ScrollView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1, backgroundColor: 'rgba(11, 17, 32, 0.88)' },
    content: { paddingBottom: 60 },
    header: {
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 24,
        paddingHorizontal: 24,
        position: 'relative',
    },
    logoutBtn: {
        position: 'absolute',
        top: 60,
        right: 20,
        backgroundColor: '#1e293b',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#334155',
    },
    logoutText: { color: '#94a3b8', fontSize: 13 },
    avatarLg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#0891b2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: 3,
        borderColor: '#22d3ee',
    },
    avatarLgText: { color: '#fff', fontWeight: '800', fontSize: 34 },
    nomeOp: { color: '#f1f5f9', fontWeight: '800', fontSize: 24, letterSpacing: -0.5 },
    ruoloOp: { color: '#64748b', fontSize: 14, marginTop: 2 },
    orologio: { color: '#22d3ee', fontWeight: '700', fontSize: 42, marginTop: 20, letterSpacing: 2, fontFamily: 'SpaceMono-Bold' },
    data: { color: '#475569', fontSize: 13, marginTop: 4, textTransform: 'capitalize' },

    badge: {
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 4,
    },
    badgeIn: { backgroundColor: '#052e16', borderWidth: 1, borderColor: '#166534' },
    badgePause: { backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#4338ca' },
    badgeOut: { backgroundColor: '#1c0a00', borderWidth: 1, borderColor: '#7c2d12' },
    badgeText: { color: '#f1f5f9', fontWeight: '700', fontSize: 16 },
    oreTrascorse: { color: '#22d3ee', fontSize: 14, fontWeight: '600' },
    pausaInfo: { color: '#a5b4fc', fontSize: 12, fontWeight: '500' },
    geoText: { color: '#64748b', fontSize: 12, textAlign: 'center' },

    section: { paddingHorizontal: 20, marginBottom: 20 },
    sectionLabel: { color: '#64748b', fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    cantiereRow: { gap: 10, paddingRight: 20 },
    cantiereChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e293b', borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
    cantiereChipSel: { backgroundColor: '#0c4a6e', borderColor: '#0891b2' },
    cantiereChipText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
    cantiereChipTextSel: { color: '#38bdf8' },

    timbraBtn: {
        marginBottom: 16,
        paddingVertical: 20,
        borderRadius: 20,
        alignItems: 'center',
        gap: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    timbraEntrata: { backgroundColor: '#065f46', borderWidth: 1, borderColor: '#10b981' },
    timbraUscita: { backgroundColor: '#7c2d12', borderWidth: 1, borderColor: '#ef4444' },
    pausaBtn: { backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#6366f1' },
    finePausaBtn: { backgroundColor: '#312e81', borderWidth: 1, borderColor: '#4ade80' },
    timbraBtnIcon: { fontSize: 32 },
    timbraBtnText: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1 },
    timbraBtnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

    ultimaCard: {
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#334155',
        gap: 4,
    },
    ultimaTitle: { color: '#64748b', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    ultimaData: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginTop: 4 },
    ultimaOre: { color: '#22d3ee', fontSize: 15, fontWeight: '600' },
    ultimaCantiere: { color: '#64748b', fontSize: 13 },

    storicoBtn: {
        marginHorizontal: 20,
        padding: 16,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    storicoBtnText: { color: '#94a3b8', fontWeight: '600', fontSize: 15 },
    smallBtn: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
    },
    materialBtn: {
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        borderColor: '#22d3ee',
    },
    notaSpeseBtn: {
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderColor: '#a78bfa',
    },
    rapportinoBtn: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: '#f59e0b',
    },
    smallBtnText: {
        color: '#22d3ee',
        fontWeight: '800',
        fontSize: 14,
        letterSpacing: 0.5,
    },
});
