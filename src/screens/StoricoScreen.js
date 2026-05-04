import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ImageBackground,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop';

export default function StoricoScreen({ route, navigation }) {
    const { dipendente } = route.params;
    const [presenze, setPresenze] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const { data } = await supabase
                .from('gestione_cantiere')
                .select('*, cantieri(nome)')
                .eq('dipendente_id', dipendente.id)
                .order('data', { ascending: false })
                .limit(60);
            setPresenze(data || []);
            setLoading(false);
        })();
    }, []);

    const totaleOre = presenze.reduce((acc, p) => acc + (parseFloat(p.ore_lavorate) || 0), 0);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#22d3ee" />
            </View>
        );
    }

    return (
        <ImageBackground source={{ uri: BACKGROUND_IMAGE }} style={styles.container}>
            <View style={styles.overlay}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Text style={styles.backText}>‹ Indietro</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Storico Presenze</Text>
                    <Text style={styles.nome}>{dipendente.nome}</Text>
                    <View style={styles.totaleBox}>
                        <Text style={styles.totaleLabel}>Ore totali registrate</Text>
                        <Text style={styles.totaleValore}>{totaleOre.toFixed(2)}h</Text>
                    </View>
                </View>

                <FlatList
                    data={presenze}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => {
                        const oraInizio = item.ora_inizio
                            ? new Date(item.ora_inizio).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            : null;
                        const oraFine = item.ora_fine
                            ? new Date(item.ora_fine).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            : null;

                        return (
                            <View style={[styles.card, item.timbrata_da_app && styles.cardApp]}>
                                <View style={styles.cardLeft}>
                                    <Text style={styles.cardData}>
                                        {new Date(item.data).toLocaleDateString('it-IT', {
                                            timeZone: 'UTC',
                                            weekday: 'short',
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </Text>
                                    {item.cantieri?.nome && (
                                        <Text style={styles.cardCantiere}>🏗️ {item.cantieri.nome}</Text>
                                    )}
                                    {oraInizio && (
                                        <Text style={styles.cardOrario}>
                                            {oraInizio}{oraFine ? ` → ${oraFine}` : ' → in corso'}
                                        </Text>
                                    )}
                                    {item.indirizzo_rilevato && (
                                        <Text style={styles.cardGeo}>📍 {item.indirizzo_rilevato}</Text>
                                    )}
                                </View>
                                <View style={styles.cardRight}>
                                    <Text style={styles.cardOre}>{Number(item.ore_lavorate).toFixed(1)}h</Text>
                                    {item.timbrata_da_app && <Text style={styles.appBadge}>📱</Text>}
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <Text style={styles.empty}>Nessuna presenza registrata.</Text>
                    }
                />
            </View>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(11, 17, 32, 0.88)' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1120' },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    backBtn: { marginBottom: 12 },
    backText: { color: '#22d3ee', fontSize: 16, fontWeight: '600' },
    title: { color: '#64748b', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    nome: { color: '#f1f5f9', fontSize: 24, fontWeight: '800', marginTop: 4, marginBottom: 16 },
    totaleBox: {
        backgroundColor: '#0c4a6e',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#0891b2',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totaleLabel: { color: '#7dd3fc', fontSize: 14, fontWeight: '600' },
    totaleValore: { color: '#38bdf8', fontSize: 24, fontWeight: '900' },
    list: { padding: 20, gap: 10 },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    cardApp: { borderColor: '#0891b2' },
    cardLeft: { flex: 1, gap: 3 },
    cardData: { color: '#f1f5f9', fontWeight: '700', fontSize: 15 },
    cardCantiere: { color: '#64748b', fontSize: 13 },
    cardOrario: { color: '#22d3ee', fontSize: 13, fontWeight: '600' },
    cardGeo: { color: '#475569', fontSize: 11 },
    cardRight: { alignItems: 'flex-end', gap: 4 },
    cardOre: { color: '#4ade80', fontWeight: '900', fontSize: 22 },
    appBadge: { fontSize: 14 },
    empty: { color: '#475569', textAlign: 'center', marginTop: 60, fontSize: 15 },
});
