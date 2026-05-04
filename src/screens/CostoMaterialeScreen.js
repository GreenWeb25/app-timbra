import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Image,
    ScrollView,
    Alert,
    ActivityIndicator,
    ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabaseClient';

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop';
const EDGE_FUNCTION_NAME = 'process-receipt';

export default function CostoMaterialeScreen({ route, navigation }) {
    const { dipendente } = route.params;

    const [cantieri, setCantieri] = useState([]);
    const [selectedCantiere, setSelectedCantiere] = useState(null);
    const [fornitore, setFornitore] = useState('');
    const [descrizione, setDescrizione] = useState('');
    const [importo, setImporto] = useState('');
    const [image, setImage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [ocrLoading, setOcrLoading] = useState(false);

    useEffect(() => {
        loadCantieri();
    }, []);

    const loadCantieri = async () => {
        const { data } = await supabase.from('cantieri').select('id, nome').order('nome');
        setCantieri(data || []);
        if (data && data.length > 0) {
            setSelectedCantiere(data[0].id);
        }
    };

    const pickImage = () => {
        Alert.alert(
            'Aggiungi Foto',
            'Scegli da dove caricare lo scontrino',
            [
                { text: '📸 Fotocamera', onPress: handleCamera },
                { text: '🖼️ Galleria', onPress: handleGallery },
                { text: 'Annulla', style: 'cancel' },
            ]
        );
    };

    const handleCamera = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permesso negato', 'Serve il permesso per la fotocamera.');
                return;
            }

            let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.5,
                allowsEditing: true,
                base64: true,
            });

            if (!result.canceled) {
                processSelection(result.assets[0].uri, result.assets[0].base64);
            }
        } catch (e) {
            Alert.alert('Errore', 'Impossibile avviare la fotocamera.');
        }
    };

    const handleGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permesso negato', 'Serve il permesso per la galleria.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled) {
            processSelection(result.assets[0].uri, result.assets[0].base64);
        }
    };

    const processSelection = (uri, base64) => {
        setImage(uri);
        extractData(uri, base64);
    };

    const extractData = async (uri, providedBase64) => {
        setOcrLoading(true);
        try {
            let base64 = providedBase64;
            if (!base64) {
                base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: 'base64',
                });
            }

            console.log('Invio immagine alla Edge Function...');

            const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
                body: { imageBase64: base64 },
            });

            if (error) {
                if (error?.context) {
                    try {
                        const body = await error.context.json();
                        console.error('--- DETTAGLI ERRORE EDGE FUNCTION ---');
                        console.error(JSON.stringify(body, null, 2));
                        throw new Error(body.error || 'Errore dalla Edge Function');
                    } catch (parseError) {
                        throw error;
                    }
                }
                throw error;
            }

            if (!data) {
                throw new Error('Il server non ha restituito dati.');
            }

            console.log('Risultato OCR:', JSON.stringify(data));

            if (data.fornitore) setFornitore(data.fornitore);
            if (data.importo != null) setImporto(data.importo.toString());
            if (data.descrizione) setDescrizione(Array.isArray(data.descrizione) ? data.descrizione.join(', ') : data.descrizione);

            Alert.alert('✅ Dati estratti', 'Ho trovato i dati della fattura! Controlla se sono corretti.');
        } catch (error) {
            console.error('--- ERRORE OCR ---', error);
            let detail = error.message;
            if (error.context) {
                try {
                    const body = await error.context.json();
                    detail = body.error || detail;
                } catch (e) { }
            }
            Alert.alert(
                'Errore OCR',
                `Impossibile leggere lo scontrino.\n\nDettaglio: ${detail}\n\nInserisci i dati manualmente.`
            );
        } finally {
            setOcrLoading(false);
        }
    };

    const uploadImage = async (uri) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const fileName = `${Date.now()}.jpg`;
        const filePath = `${dipendente.id}/${fileName}`;

        const { error } = await supabase.storage
            .from('materiali_foto')
            .upload(filePath, arrayBuffer, {
                contentType: 'image/jpeg',
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('materiali_foto')
            .getPublicUrl(filePath);

        return publicUrl;
    };

    const handleSave = async () => {
        if (!selectedCantiere || !descrizione || !importo) {
            Alert.alert('Errore', 'Compila tutti i campi obbligatori.');
            return;
        }

        setLoading(true);
        try {
            let fotoUrl = null;
            if (image) {
                fotoUrl = await uploadImage(image);
            }

            const { error } = await supabase.from('materiali').insert([
                {
                    cantiere_id: selectedCantiere,
                    dipendente_id: dipendente.id,
                    fornitore,
                    descrizione,
                    importo: parseFloat(importo.replace(',', '.')),
                    data: new Date().toISOString().split('T')[0],
                    foto_url: fotoUrl,
                },
            ]);

            if (error) throw error;

            Alert.alert('Successo', 'Costo materiale registrato correttamente.', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            Alert.alert('Errore', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ImageBackground source={{ uri: BACKGROUND_IMAGE }} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Text style={styles.backText}>‹ Indietro</Text>
                        </TouchableOpacity>
                        <Text style={styles.title}>Nuovo Costo Materiale</Text>
                    </View>

                    <View style={styles.form}>
                        <Text style={styles.label}>Cantiere</Text>
                        <View style={styles.pickerContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cantiereRow}>
                                {cantieri.map((c) => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.cantiereChip, selectedCantiere === c.id && styles.cantiereChipSel]}
                                        onPress={() => setSelectedCantiere(c.id)}
                                    >
                                        <Text style={[styles.cantiereChipText, selectedCantiere === c.id && styles.cantiereChipTextSel]}>
                                            {c.nome}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <Text style={styles.label}>Fornitore</Text>
                        <TextInput
                            style={styles.input}
                            value={fornitore}
                            onChangeText={setFornitore}
                            placeholder="es. Leroy Merlin"
                            placeholderTextColor="#64748b"
                        />

                        <Text style={styles.label}>Descrizione</Text>
                        <TextInput
                            style={styles.input}
                            value={descrizione}
                            onChangeText={setDescrizione}
                            placeholder="es. Sacchi di cemento"
                            placeholderTextColor="#64748b"
                        />

                        <Text style={styles.label}>Importo (€)</Text>
                        <TextInput
                            style={styles.input}
                            value={importo}
                            onChangeText={setImporto}
                            placeholder="0.00"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                        />

                        <Text style={styles.label}>Foto Scontrino/Fattura</Text>
                        <TouchableOpacity
                            style={styles.imageButton}
                            onPress={pickImage}
                            disabled={ocrLoading}
                        >
                            {image ? (
                                <View style={styles.previewContainer}>
                                    <Image source={{ uri: image }} style={styles.previewImage} />
                                    {ocrLoading && (
                                        <View style={styles.ocrOverlay}>
                                            <ActivityIndicator color="#fff" size="large" />
                                            <Text style={styles.ocrText}>Lettura dati in corso...</Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <View style={styles.imagePlaceholder}>
                                    <Text style={styles.imagePlaceholderText}>📸 Scatta Foto</Text>
                                    <Text style={styles.imagePlaceholderSub}>Rilevo automaticamente i dati</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.saveButton, (loading || ocrLoading) && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={loading || ocrLoading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#052e16" />
                            ) : (
                                <Text style={styles.saveButtonText}>SALVA COSTO</Text>
                            )}
                        </TouchableOpacity>
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
    header: { padding: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { marginRight: 15 },
    backText: { color: '#22d3ee', fontSize: 18, fontWeight: '600' },
    title: { color: '#f1f5f9', fontSize: 20, fontWeight: '800' },
    form: { paddingHorizontal: 20 },
    label: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    input: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 15,
        color: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#334155',
        fontSize: 16,
    },
    pickerContainer: { marginBottom: 10 },
    cantiereRow: { gap: 10, paddingRight: 20 },
    cantiereChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e293b', borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
    cantiereChipSel: { backgroundColor: '#0c4a6e', borderColor: '#0891b2' },
    cantiereChipText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
    cantiereChipTextSel: { color: '#38bdf8' },
    imageButton: {
        width: '100%',
        height: 200,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#334155',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginTop: 4,
    },
    previewImage: { width: '100%', height: '100%' },
    imagePlaceholder: { alignItems: 'center', gap: 8 },
    imagePlaceholderText: { color: '#64748b', fontSize: 18, fontWeight: '700' },
    imagePlaceholderSub: { color: '#475569', fontSize: 12 },
    previewContainer: { width: '100%', height: '100%', position: 'relative' },
    ocrOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
    },
    ocrText: { color: '#fff', fontWeight: '700', marginTop: 10 },
    saveButton: {
        backgroundColor: '#4ade80',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginTop: 32,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: '#052e16', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
});
