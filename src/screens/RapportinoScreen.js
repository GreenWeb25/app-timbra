import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Image, Platform,
    ImageBackground,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabaseClient';

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop';

const LAVORAZIONI = [
    'Muratura', 'Intonaco', 'Cappotto Termico', 'Demolizione',
    'Posa Pavimenti', 'Impianti', 'Tinteggiatura', 'Posa Infissi',
    'Copertura/Tetto', 'Altro'
];

export default function RapportinoScreen({ route, navigation }) {
    const { dipendente, cantiere, presenzaId, oreLavorate } = route.params;

    const [descrizione, setDescrizione] = useState('');
    const [lavorazione, setLavorazione] = useState('');
    const [ore, setOre] = useState(oreLavorate ? String(oreLavorate) : '');
    const [note, setNote] = useState('');
    const [foto, setFoto] = useState([]); // Array di { uri, didascalia }
    const [aiLoading, setAiLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Audio recording
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const timerRef = useRef(null);

    const dataDiOggi = new Date().toLocaleDateString('it-IT', {
        weekday: 'long', day: '2-digit', month: 'long'
    });

    // ── REGISTRAZIONE VOCALE ──────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permesso negato', 'Serve il permesso per usare il microfono. Vai in Impostazioni > App e abilita il microfono.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(rec);
            setIsRecording(true);
            setRecordingSeconds(0);
            timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
        } catch (e) {
            Alert.alert('Errore microfono', e?.message || String(e));
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        clearInterval(timerRef.current);
        setIsRecording(false);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (uri) await transcribeAudio(uri);
    };

    const transcribeAudio = async (uri) => {
        setAiLoading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const { data, error } = await supabase.functions.invoke('rapportino-ai', {
                body: { mode: 'transcribe', audioBase64: base64, mimeType: 'audio/m4a' }
            });
            if (error) throw error;
            if (data?.trascrizione) {
                setDescrizione(prev => prev ? prev + '\n' + data.trascrizione : data.trascrizione);
                if (data.lavorazione && !lavorazione) setLavorazione(data.lavorazione);
                Alert.alert('✅ Trascritto!', 'Il vocale è stato convertito in testo dall\'AI.');
            }
        } catch (e) {
            Alert.alert('Errore AI', 'Impossibile trascrivere il vocale. Riprova.');
        } finally {
            setAiLoading(false);
        }
    };

    // ── FOTO ─────────────────────────────────────────────────────────────────
    const pickPhoto = async (fromCamera) => {
        try {
            let result;
            if (fromCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') { Alert.alert('Permesso negato', 'Serve la fotocamera.'); return; }
                result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });
            }
            if (!result.canceled && result.assets?.[0]) {
                await analyzePhoto(result.assets[0]);
            }
        } catch (e) {
            Alert.alert('Errore', 'Impossibile accedere alle foto.');
        }
    };

    const analyzePhoto = async (asset) => {
        setAiLoading(true);
        try {
            const base64 = asset.base64 || await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
            const { data, error } = await supabase.functions.invoke('rapportino-ai', {
                body: { mode: 'analyze_photo', imageBase64: base64 }
            });
            const didascalia = data?.didascalia || '';
            setFoto(prev => [...prev, { uri: asset.uri, base64, didascalia }]);
            if (didascalia) Alert.alert('📷 Foto analizzata', `AI: "${didascalia}"`);
        } catch (e) {
            setFoto(prev => [...prev, { uri: asset.uri, base64: asset.base64, didascalia: '' }]);
        } finally {
            setAiLoading(false);
        }
    };

    const removeFoto = (index) => {
        setFoto(prev => prev.filter((_, i) => i !== index));
    };

    // ── SALVA ────────────────────────────────────────────────────────────────
    const salvaRapportino = async () => {
        if (!descrizione.trim() && foto.length === 0) {
            Alert.alert('Attenzione', 'Inserisci almeno una descrizione o una foto.');
            return;
        }
        setSaving(true);
        try {
            // Upload foto su Supabase Storage
            const fotoUrls = [];
            for (const f of foto) {
                if (!f.base64) continue;
                const fileName = `${dipendente.id}_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('rapportini-foto')
                    .upload(fileName, decode(f.base64), { contentType: 'image/jpeg', upsert: false });
                if (!uploadErr) {
                    const { data: urlData } = supabase.storage.from('rapportini-foto').getPublicUrl(fileName);
                    fotoUrls.push(urlData.publicUrl);
                }
            }

            // Salva rapportino
            const { error } = await supabase.from('rapportini').insert([{
                gestione_cantiere_id: presenzaId || null,
                dipendente_id: dipendente.id,
                cantiere_id: cantiere.id,
                data: new Date().toISOString().split('T')[0],
                descrizione_lavori: descrizione.trim() || null,
                lavorazione: lavorazione || null,
                ore_dichiarate: parseFloat(ore) || null,
                note: note.trim() || null,
                foto_urls: fotoUrls.length > 0 ? fotoUrls : null,
                firmato: true,
            }]);

            setSaving(false);
            if (error) {
                Alert.alert('Errore', error.message);
            } else {
                Alert.alert('✅ Rapportino Inviato!', 'Il rapportino giornaliero è stato firmato e salvato.', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (e) {
            setSaving(false);
            Alert.alert('Errore', e.message || 'Errore durante il salvataggio.');
        }
    };

    // Helper: decode base64 for storage upload
    function decode(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
    }

    return (
        <ImageBackground source={{ uri: BACKGROUND_IMAGE }} style={S.bg}>
            <ScrollView style={S.scroll} contentContainerStyle={S.content}>

                {/* Header */}
                <View style={S.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
                        <Text style={S.backText}>← Indietro</Text>
                    </TouchableOpacity>
                    <Text style={S.title}>📋 Rapportino</Text>
                    <Text style={S.subtitle}>{dataDiOggi}</Text>
                    <View style={S.infoPill}>
                        <Text style={S.infoPillText}>👷 {dipendente.nome}  •  🏗️ {cantiere.nome}</Text>
                    </View>
                </View>

                {/* Sezione Vocale */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>🎤 Descrizione Vocale</Text>
                    <Text style={S.sectionHint}>Registra un messaggio vocale, l'AI lo trascrive automaticamente</Text>
                    <TouchableOpacity
                        style={[S.voiceBtn, isRecording && S.voiceBtnActive]}
                        onPress={isRecording ? stopRecording : startRecording}
                        disabled={aiLoading}
                    >
                        <Text style={S.voiceBtnIcon}>{isRecording ? '⏹️' : '🎤'}</Text>
                        <Text style={S.voiceBtnText}>
                            {isRecording ? `Registrando... ${recordingSeconds}s  •  Tocca per fermare` : 'Tieni premuto per registrare'}
                        </Text>
                    </TouchableOpacity>
                    {aiLoading && (
                        <View style={S.aiLoading}>
                            <ActivityIndicator color="#a78bfa" />
                            <Text style={S.aiLoadingText}>AI in elaborazione...</Text>
                        </View>
                    )}
                </View>

                {/* Descrizione Lavori */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>📝 Lavori Eseguiti</Text>
                    <TextInput
                        style={S.textArea}
                        value={descrizione}
                        onChangeText={setDescrizione}
                        placeholder="Descrivi i lavori della giornata (compilato dal vocale o manualmente)..."
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Tipo Lavorazione */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>🔧 Tipo Lavorazione</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
                        {LAVORAZIONI.map(l => (
                            <TouchableOpacity
                                key={l}
                                style={[S.chip, lavorazione === l && S.chipSel]}
                                onPress={() => setLavorazione(lavorazione === l ? '' : l)}
                            >
                                <Text style={[S.chipText, lavorazione === l && S.chipTextSel]}>{l}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Ore */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>⏱️ Ore Lavorate</Text>
                    <TextInput
                        style={[S.textArea, { height: 52 }]}
                        value={ore}
                        onChangeText={setOre}
                        placeholder="Es: 8.5"
                        placeholderTextColor="#475569"
                        keyboardType="decimal-pad"
                    />
                </View>

                {/* Foto */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>📸 Foto Cantiere</Text>
                    <Text style={S.sectionHint}>L'AI analizzerà automaticamente ogni foto</Text>
                    <View style={S.photoRow}>
                        <TouchableOpacity style={S.photoBtn} onPress={() => pickPhoto(true)} disabled={aiLoading}>
                            <Text style={S.photoBtnIcon}>📷</Text>
                            <Text style={S.photoBtnText}>Scatta</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.photoBtn} onPress={() => pickPhoto(false)} disabled={aiLoading}>
                            <Text style={S.photoBtnIcon}>🖼️</Text>
                            <Text style={S.photoBtnText}>Galleria</Text>
                        </TouchableOpacity>
                    </View>
                    {foto.map((f, i) => (
                        <View key={i} style={S.fotoCard}>
                            <Image source={{ uri: f.uri }} style={S.fotoImage} />
                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                {f.didascalia ? (
                                    <Text style={S.didascalia}>🤖 {f.didascalia}</Text>
                                ) : (
                                    <Text style={S.didascalia2}>Nessuna didascalia AI</Text>
                                )}
                                <TouchableOpacity onPress={() => removeFoto(i)} style={S.removeBtn}>
                                    <Text style={S.removeBtnText}>🗑️ Rimuovi</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Note */}
                <View style={S.section}>
                    <Text style={S.sectionLabel}>💬 Note / Problemi</Text>
                    <TextInput
                        style={S.textArea}
                        value={note}
                        onChangeText={setNote}
                        placeholder="Problemi riscontrati, materiali mancanti, comunicazioni per l'ufficio..."
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </View>

                {/* Firma e Invia */}
                <TouchableOpacity
                    style={[S.firmaBtn, saving && { opacity: 0.5 }]}
                    onPress={salvaRapportino}
                    disabled={saving || aiLoading}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={S.firmaBtnIcon}>✅</Text>
                            <Text style={S.firmaBtnText}>FIRMA E INVIA RAPPORTINO</Text>
                            <Text style={S.firmaBtnSub}>Il rapportino verrà salvato e inviato all'ufficio</Text>
                        </>
                    )}
                </TouchableOpacity>

            </ScrollView>
        </ImageBackground>
    );
}

const S = StyleSheet.create({
    bg: { flex: 1 },
    scroll: { flex: 1, backgroundColor: 'rgba(11, 17, 32, 0.9)' },
    content: { paddingBottom: 60 },

    header: {
        paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center',
    },
    backBtn: {
        alignSelf: 'flex-start', backgroundColor: '#1e293b',
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        borderWidth: 1, borderColor: '#334155', marginBottom: 16,
    },
    backText: { color: '#94a3b8', fontSize: 14 },
    title: { color: '#f1f5f9', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    subtitle: { color: '#64748b', fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
    infoPill: {
        marginTop: 12, backgroundColor: 'rgba(34,211,238,0.08)',
        borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)',
    },
    infoPillText: { color: '#22d3ee', fontSize: 14, fontWeight: '600' },

    section: { paddingHorizontal: 20, marginBottom: 24 },
    sectionLabel: {
        color: '#e2e8f0', fontSize: 14, fontWeight: '700',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    sectionHint: { color: '#475569', fontSize: 12, marginBottom: 10 },

    voiceBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: 'rgba(167, 139, 250, 0.1)', borderRadius: 16,
        padding: 18, borderWidth: 1, borderColor: '#a78bfa',
    },
    voiceBtnActive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444',
    },
    voiceBtnIcon: { fontSize: 28 },
    voiceBtnText: { color: '#c4b5fd', fontSize: 14, fontWeight: '600', flex: 1 },

    aiLoading: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginTop: 12, padding: 12, backgroundColor: 'rgba(167,139,250,0.08)',
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    },
    aiLoadingText: { color: '#a78bfa', fontSize: 13 },

    textArea: {
        backgroundColor: '#1e293b', borderRadius: 12,
        borderWidth: 1, borderColor: '#334155', color: '#f1f5f9',
        padding: 14, fontSize: 14, lineHeight: 22, minHeight: 100,
    },

    chipRow: { gap: 8, paddingRight: 20 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 9,
        backgroundColor: '#1e293b', borderRadius: 20,
        borderWidth: 1, borderColor: '#334155',
    },
    chipSel: { backgroundColor: '#0c4a6e', borderColor: '#22d3ee' },
    chipText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
    chipTextSel: { color: '#38bdf8' },

    photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    photoBtn: {
        flex: 1, alignItems: 'center', paddingVertical: 18,
        backgroundColor: 'rgba(34,211,238,0.07)', borderRadius: 14,
        borderWidth: 1, borderColor: '#22d3ee',
    },
    photoBtnIcon: { fontSize: 28, marginBottom: 4 },
    photoBtnText: { color: '#22d3ee', fontWeight: '700', fontSize: 12 },

    fotoCard: {
        flexDirection: 'row', backgroundColor: '#1e293b',
        borderRadius: 12, overflow: 'hidden', marginBottom: 10,
        borderWidth: 1, borderColor: '#334155',
    },
    fotoImage: { width: 90, height: 90 },
    didascalia: { color: '#94a3b8', fontSize: 12, lineHeight: 18, flex: 1, marginTop: 8 },
    didascalia2: { color: '#334155', fontSize: 11, marginTop: 8 },
    removeBtn: { marginTop: 8 },
    removeBtnText: { color: '#ef4444', fontSize: 12 },

    firmaBtn: {
        margin: 20, paddingVertical: 22, borderRadius: 20,
        backgroundColor: '#065f46', alignItems: 'center', gap: 4,
        borderWidth: 1, borderColor: '#10b981',
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
    },
    firmaBtnIcon: { fontSize: 32 },
    firmaBtnText: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 0.5 },
    firmaBtnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
});
