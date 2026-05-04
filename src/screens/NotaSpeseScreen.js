import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Image, Modal,
  KeyboardAvoidingView, Platform, FlatList, SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';

// ─── CATEGORIE FISCALI ITALIANE ───────────────────────────────────────────────
const CATEGORIE = [
  {
    id: 'vitto',
    label: 'Vitto e ristorazione',
    icon: 'restaurant',
    deducibile: true,
    percentuale: 75,
    note: 'Deducibile al 75% (art. 109 TUIR). Conservare scontrino con generalità commensali.',
    colore: '#f59e0b',
  },
  {
    id: 'carburante',
    label: 'Carburante',
    icon: 'car',
    deducibile: true,
    percentuale: 100,
    note: 'Deducibile al 100% se veicolo aziendale, 20-80% se uso promiscuo.',
    colore: '#60a5fa',
  },
  {
    id: 'materiali',
    label: 'Materiali e forniture',
    icon: 'construct',
    deducibile: true,
    percentuale: 100,
    note: 'Deducibile al 100%. Assicurarsi che la fattura riporti il P.IVA aziendale.',
    colore: '#4ade80',
  },
  {
    id: 'alloggio',
    label: 'Alloggio / Hotel',
    icon: 'bed',
    deducibile: true,
    percentuale: 75,
    note: 'Deducibile al 75%. Richiedere sempre fattura intestata all\'azienda.',
    colore: '#a78bfa',
  },
  {
    id: 'trasporto',
    label: 'Trasporto / Pedaggi',
    icon: 'train',
    deducibile: true,
    percentuale: 100,
    note: 'Deducibile al 100% se inerente all\'attività.',
    colore: '#22d3ee',
  },
  {
    id: 'attrezzatura',
    label: 'Attrezzatura e DPI',
    icon: 'hammer',
    deducibile: true,
    percentuale: 100,
    note: 'Deducibile al 100%. Conservare fattura.',
    colore: '#fb923c',
  },
  {
    id: 'telefonia',
    label: 'Telefonia / Internet',
    icon: 'call',
    deducibile: true,
    percentuale: 80,
    note: 'Deducibile all\'80% per uso promiscuo (art. 102 TUIR).',
    colore: '#34d399',
  },
  {
    id: 'altro',
    label: 'Altro',
    icon: 'receipt',
    deducibile: true,
    percentuale: 100,
    note: 'Verificare con il commercialista la deducibilità.',
    colore: '#94a3b8',
  },
  {
    id: 'non_deducibile',
    label: 'Non deducibile',
    icon: 'close-circle',
    deducibile: false,
    percentuale: 0,
    note: 'Spesa personale non inerente all\'attività aziendale.',
    colore: '#ef4444',
  },
];

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);

const oggi = () => new Date().toISOString().split('T')[0];

const csvEscape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function NotaSpeseScreen({ navigation, route }) {
  const dipendente = route?.params?.dipendente;

  // UI state
  const [schermata, setSchermata] = useState('lista'); // lista | nuova | dettaglio
  const [spese, setSpese]         = useState([]);
  const [cantieri, setCantieri]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [scanning, setScanning]   = useState(false);

  // Form nuova spesa
  const [foto, setFoto]                       = useState(null);
  const [fotoBase64, setFotoBase64]           = useState(null);
  const [fornitore, setFornitore]             = useState('');
  const [importo, setImporto]                 = useState('');
  const [iva, setIva]                         = useState('');
  const [dataSpesa, setDataSpesa]             = useState(oggi());
  const [oraSpesa, setOraSpesa]               = useState('');
  const [categoriaId, setCategoriaId]         = useState(null);
  const [cantiereId, setCantiereId]           = useState(null);
  const [descrizione, setDescrizione]         = useState('');
  const [noteClaude, setNoteClaude]           = useState('');
  const [showCantieri, setShowCantieri]       = useState(false);
  const [spesaDettaglio, setSpesaDettaglio]   = useState(null);

  const categoria = CATEGORIE.find(c => c.id === categoriaId);
  const cantiere  = cantieri.find(c => c.id === cantiereId);
  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    let s = String(val).trim();
    // Se c'è la virgola, è formato italiano (es. 1.234,56 o 1234,56)
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const valImporto = parseNum(importo);
  const valIva = parseNum(iva);
  const imponibile = Math.round((valImporto - valIva) * 100) / 100;
  
  const importoDeducibile = categoria
    ? Math.round(imponibile * categoria.percentuale) / 100
    : 0;

  // ── Carica cantieri ──
  const caricaCantieri = async () => {
    const { data } = await supabase.from('cantieri').select('id, nome').order('nome');
    setCantieri(data || []);
  };

  // ── Carica spese da Supabase ──
  const caricaSpese = useCallback(async () => {
    if (!dipendente?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spese')
        .select('*')
        .eq('dipendente_id', dipendente.id)
        .order('data_spesa', { ascending: false });
      if (!error && data) setSpese(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [dipendente?.id]);

  useEffect(() => { 
    caricaCantieri();
    caricaSpese(); 
  }, [caricaSpese]);

  // ── Apri camera / libreria ──
  const apriCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso necessario', 'Consenti l\'accesso alla fotocamera nelle impostazioni.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFoto(asset.uri);
      setFotoBase64(asset.base64);
      await analizzaScontrino(asset.base64);
    }
  };

  const apriLibreria = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso necessario', 'Consenti l\'accesso alla libreria foto nelle impostazioni.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFoto(asset.uri);
      setFotoBase64(asset.base64);
      await analizzaScontrino(asset.base64);
    }
  };

  // ── Claude Vision: analizza scontrino ──
  const analizzaScontrino = async (base64) => {
    setScanning(true);
    try {
        // Usa la Edge Function esistente se possibile per coerenza, 
        // ma siccome il codice originale usava l'API diretta di Claude,
        // lo manteniamo adattandolo nel caso in cui serva. 
        // NOTA: In produzione è meglio usare supabase.functions.invoke('process-receipt')
        
        const { data, error } = await supabase.functions.invoke('process-receipt', {
            body: { imageBase64: base64 },
        });

        if (!error && data) {
            if (data.fornitore)     setFornitore(data.fornitore);
            if (data.importo)       setImporto(String(data.importo));
            if (data.data)          setDataSpesa(data.data);
            if (data.descrizione)   setDescrizione(Array.isArray(data.descrizione) ? data.descrizione.join(', ') : data.descrizione);
            // Mappare categoria se possibile o lasciare a utente
        }
    } catch (e) {
      // Alert.alert('Errore analisi', 'Impossibile analizzare lo scontrino. Compila i campi manualmente.');
    }
    setScanning(false);
  };

  // ── Reset form ──
  const resetForm = () => {
    setFoto(null); setFotoBase64(null);
    setFornitore(''); setImporto(''); setIva('');
    setDataSpesa(oggi()); setOraSpesa('');
    setCategoriaId(null); setCantiereId(null);
    setDescrizione(''); setNoteClaude('');
  };

  // ── Salva spesa ──
  const salvaSpesa = async () => {
    const numImporto = parseNum(importo);
    if (numImporto <= 0) {
      Alert.alert('Importo mancante', 'Inserisci l\'importo della spesa.');
      return;
    }
    if (!categoriaId) {
      Alert.alert('Categoria mancante', 'Seleziona la categoria della spesa.');
      return;
    }
    setLoading(true);
    const nuovaSpesa = {
      dipendente_id:          dipendente.id,
      dipendente_nome:        dipendente.nome,
      cantiere_id:            cantiereId,
      cantiere_nome:          cantiere?.nome || null,
      data_spesa:             dataSpesa,
      ora_spesa:              oraSpesa || null,
      fornitore:              fornitore || null,
      importo:                numImporto,
      iva:                    iva ? parseNum(iva) : null,
      imponibile:             imponibile,
      categoria:              categoriaId,
      descrizione:            descrizione || null,
      deducibile:             categoria?.deducibile ?? true,
      percentuale_deducibilita: categoria?.percentuale ?? 100,
      note_fiscali:           noteClaude || categoria?.note || null,
      foto_base64:            fotoBase64 || null,
      stato:                  'da_approvare',
    };

    console.log('--- TENTATIVO SALVATAGGIO SPESA ---');
    console.log('Payload:', JSON.stringify(nuovaSpesa, null, 2));

    try {
      const { data, error } = await supabase.from('spese').insert([nuovaSpesa]).select();
      if (error) {
        console.error('Errore Supabase:', error);
        throw error;
      }
      console.log('Successo:', data);
      Alert.alert('Spesa salvata!', 'La spesa è stata inviata per approvazione.', [
        { text: 'OK', onPress: () => { resetForm(); setSchermata('lista'); caricaSpese(); } }
      ]);
    } catch (e) {
      console.error('Errore Catch:', e);
      Alert.alert('Errore', 'Impossibile salvare la spesa: ' + e.message);
    }
    setLoading(false);
  };

  // ── Export CSV ──
  const esportaCSV = async () => {
    const header = 'Data,Ora,Fornitore,Importo,IVA,Imponibile,Categoria,Cantiere,Deducibile,%Deducibile,Stato,Dipendente\n';
    const righe = spese.map(s => [
      s.data_spesa, s.ora_spesa || '', s.fornitore || '',
      s.importo, s.iva || '', s.imponibile || s.importo,
      s.categoria, s.cantiere_nome || '',
      s.deducibile ? 'Sì' : 'No',
      (s.percentuale_deducibilita || 100) + '%',
      s.stato, s.dipendente_nome || dipendente.nome,
    ].map(csvEscape).join(',')).join('\n');

    const csv = header + righe;
    const path = FileSystem.documentDirectory + `nota_spese_${oggi()}.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Esporta nota spese' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: LISTA SPESE
  // ─────────────────────────────────────────────────────────────────────────
  const renderLista = () => {
    const totale    = spese.reduce((s, v) => s + (v.importo || 0), 0);
    const deducibile = spese.reduce((s, v) => s + ((v.importo || 0) * ((v.percentuale_deducibilita || 100) / 100)), 0);
    const daApprovare = spese.filter(s => s.stato === 'da_approvare').length;

    return (
      <SafeAreaView style={S.safe}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#22d3ee" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.headerTitle}>Nota Spese</Text>
            <Text style={S.headerSub}>{dipendente?.nome}</Text>
          </View>
          <TouchableOpacity onPress={esportaCSV} style={S.iconBtn}>
            <Ionicons name="download-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* KPI cards */}
        <View style={S.kpiRow}>
          <View style={[S.kpiCard, { borderColor: 'rgba(34,211,238,0.25)' }]}>
            <Text style={S.kpiLabel}>Totale spese</Text>
            <Text style={[S.kpiVal, { color: '#22d3ee' }]}>{fmt(totale)}</Text>
          </View>
          <View style={[S.kpiCard, { borderColor: 'rgba(96,165,250,0.25)' }]}>
            <Text style={S.kpiLabel}>Deducibile</Text>
            <Text style={[S.kpiVal, { color: '#60a5fa' }]}>{fmt(deducibile)}</Text>
          </View>
          <View style={[S.kpiCard, { borderColor: 'rgba(245,158,11,0.25)' }]}>
            <Text style={S.kpiLabel}>Da approvare</Text>
            <Text style={[S.kpiVal, { color: '#f59e0b' }]}>{daApprovare}</Text>
          </View>
        </View>

        {/* Lista */}
        {loading ? (
          <ActivityIndicator color="#22d3ee" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={spese}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={S.emptyWrap}>
                <Ionicons name="receipt-outline" size={48} color="#1e3a4a" />
                <Text style={S.emptyText}>Nessuna spesa registrata</Text>
                <Text style={S.emptySubText}>Fotografa il primo scontrino</Text>
              </View>
            }
            renderItem={({ item }) => {
              const cat = CATEGORIE.find(c => c.id === item.categoria) || CATEGORIE[7];
              const statoPill = {
                da_approvare: { bg: 'rgba(245,158,11,0.12)', c: '#f59e0b', label: 'Da approvare' },
                approvata:    { bg: 'rgba(74,222,128,0.12)',  c: '#4ade80', label: 'Approvata' },
                rifiutata:    { bg: 'rgba(239,68,68,0.12)',   c: '#ef4444', label: 'Rifiutata' },
              }[item.stato] || { bg: 'rgba(148,163,184,0.1)', c: '#94a3b8', label: item.stato };

              return (
                <TouchableOpacity
                  style={S.speseCard}
                  onPress={() => { setSpesaDettaglio(item); setSchermata('dettaglio'); }}
                  activeOpacity={0.7}
                >
                  <View style={[S.catDot, { backgroundColor: cat.colore + '22', borderColor: cat.colore + '44' }]}>
                    <Ionicons name={cat.icon} size={18} color={cat.colore} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.speseFornitore} numberOfLines={1}>
                      {item.fornitore || 'Scontrino'}
                    </Text>
                    <Text style={S.speseInfo}>
                      {item.data_spesa} {item.cantiere_nome ? `· ${item.cantiere_nome}` : ''}
                    </Text>
                    <View style={S.pillRow}>
                      <View style={[S.pill, { backgroundColor: statoPill.bg }]}>
                        <Text style={[S.pillText, { color: statoPill.c }]}>{statoPill.label}</Text>
                      </View>
                      {item.deducibile && (
                        <View style={[S.pill, { backgroundColor: 'rgba(96,165,250,0.1)' }]}>
                          <Text style={[S.pillText, { color: '#60a5fa' }]}>{item.percentuale_deducibilita}% deducibile</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[S.speseImporto, { color: cat.colore }]}>{fmt(item.importo)}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* FAB */}
        <TouchableOpacity style={S.fab} onPress={() => setSchermata('nuova')} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#0b1120" />
        </TouchableOpacity>
      </SafeAreaView>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: NUOVA SPESA
  // ─────────────────────────────────────────────────────────────────────────
  const renderNuova = () => (
    <SafeAreaView style={S.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => { resetForm(); setSchermata('lista'); }} style={S.backBtn}>
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>
          <Text style={S.headerTitle}>Nuova spesa</Text>
          <TouchableOpacity onPress={salvaSpesa} disabled={loading} style={S.saveBtn}>
            {loading ? <ActivityIndicator size="small" color="#0b1120" /> : <Text style={S.saveBtnText}>Salva</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={S.formScroll} keyboardShouldPersistTaps="handled">

          {/* Zona foto */}
          {foto ? (
            <View style={S.fotoWrap}>
              <Image source={{ uri: foto }} style={S.fotoPreview} resizeMode="cover" />
              {scanning && (
                <View style={S.scanOverlay}>
                  <ActivityIndicator color="#22d3ee" size="large" />
                  <Text style={S.scanText}>Analisi scontrino in corso…</Text>
                </View>
              )}
              {!scanning && (
                <TouchableOpacity style={S.fotoRimuovi} onPress={() => { setFoto(null); setFotoBase64(null); }}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={S.fotoButtons}>
              <TouchableOpacity style={S.fotoBtn} onPress={apriCamera} activeOpacity={0.8}>
                <Ionicons name="camera" size={24} color="#22d3ee" />
                <Text style={S.fotoBtnText}>Scatta foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.fotoBtn} onPress={apriLibreria} activeOpacity={0.8}>
                <Ionicons name="images" size={24} color="#a78bfa" />
                <Text style={[S.fotoBtnText, { color: '#a78bfa' }]}>Dalla libreria</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Badge Claude */}
          {noteClaude ? (
            <View style={S.claudeBadge}>
              <Ionicons name="sparkles" size={13} color="#a78bfa" />
              <Text style={S.claudeText}>{noteClaude}</Text>
            </View>
          ) : null}

          {/* Categoria */}
          <Text style={S.fieldLabel}>Categoria fiscale *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {CATEGORIE.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[S.catChip, categoriaId === cat.id && { borderColor: cat.colore, backgroundColor: cat.colore + '18' }]}
                onPress={() => setCategoriaId(cat.id)}
                activeOpacity={0.7}
              >
                <Ionicons name={cat.icon} size={14} color={categoriaId === cat.id ? cat.colore : '#94a3b8'} />
                <Text style={[S.catChipText, categoriaId === cat.id && { color: cat.colore }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Nota deducibilità */}
          {categoria && (
            <View style={[S.fiscalBox, { borderColor: categoria.colore + '44' }]}>
              <Ionicons name="information-circle" size={14} color={categoria.colore} />
              <Text style={[S.fiscalText, { color: categoria.colore }]}>
                {categoria.percentuale > 0
                  ? `Deducibile al ${categoria.percentuale}%`
                  : 'Non deducibile'
                }
              </Text>
              <Text style={S.fiscalNote}>{categoria.note}</Text>
            </View>
          )}

          {/* Fornitore */}
          <Text style={S.fieldLabel}>Fornitore / Esercente</Text>
          <TextInput
            style={S.input}
            value={fornitore}
            onChangeText={setFornitore}
            placeholder="es. Autogrill, ENI, Brico Center..."
            placeholderTextColor="#475569"
          />

          {/* Importo + IVA */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={S.fieldLabel}>Importo totale *</Text>
              <TextInput
                style={S.input}
                value={importo}
                onChangeText={setImporto}
                placeholder="0.00"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.fieldLabel}>di cui IVA</Text>
              <TextInput
                style={S.input}
                value={iva}
                onChangeText={setIva}
                placeholder="0.00"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Riepilogo importi */}
          {importo ? (
            <View style={S.importiBox}>
              <View style={S.importiRow}>
                <Text style={S.importiLabel}>Imponibile</Text>
                <Text style={S.importiVal}>{fmt(imponibile)}</Text>
              </View>
              {categoria && (
                <View style={S.importiRow}>
                  <Text style={S.importiLabel}>Importo deducibile ({categoria.percentuale}%)</Text>
                  <Text style={[S.importiVal, { color: '#22d3ee' }]}>{fmt(importoDeducibile)}</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Data e ora */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Text style={S.fieldLabel}>Data spesa</Text>
              <TextInput
                style={S.input}
                value={dataSpesa}
                onChangeText={setDataSpesa}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#475569"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.fieldLabel}>Ora</Text>
              <TextInput
                style={S.input}
                value={oraSpesa}
                onChangeText={setOraSpesa}
                placeholder="HH:MM"
                placeholderTextColor="#475569"
              />
            </View>
          </View>

          {/* Cantiere */}
          <Text style={S.fieldLabel}>Cantiere di riferimento</Text>
          <TouchableOpacity style={S.input} onPress={() => setShowCantieri(true)}>
            <Text style={{ color: cantiere ? '#e2e8f0' : '#475569', fontSize: 14 }}>
              {cantiere ? cantiere.nome : 'Seleziona cantiere (opzionale)'}
            </Text>
          </TouchableOpacity>

          {/* Descrizione */}
          <Text style={S.fieldLabel}>Note / Descrizione</Text>
          <TextInput
            style={[S.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
            value={descrizione}
            onChangeText={setDescrizione}
            placeholder="Dettagli sulla spesa..."
            placeholderTextColor="#475569"
            multiline
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal selezione cantiere */}
      <Modal visible={showCantieri} transparent animationType="slide">
        <View style={S.modalBackdrop}>
          <View style={S.modalBox}>
            <Text style={S.modalTitle}>Seleziona cantiere</Text>
            <TouchableOpacity style={S.modalItem} onPress={() => { setCantiereId(null); setShowCantieri(false); }}>
              <Text style={{ color: '#94a3b8', fontSize: 14 }}>Nessun cantiere</Text>
            </TouchableOpacity>
            {cantieri.map(c => (
              <TouchableOpacity key={c.id} style={S.modalItem} onPress={() => { setCantiereId(c.id); setShowCantieri(false); }}>
                <Ionicons name="construct-outline" size={14} color="#22d3ee" />
                <Text style={{ color: '#e2e8f0', fontSize: 14, marginLeft: 8 }}>{c.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: DETTAGLIO SPESA
  // ─────────────────────────────────────────────────────────────────────────
  const renderDettaglio = () => {
    const s = spesaDettaglio;
    if (!s) return null;
    const cat = CATEGORIE.find(c => c.id === s.categoria) || CATEGORIE[7];
    const dedAmt = (s.imponibile || s.importo) * ((s.percentuale_deducibilita || 100) / 100);

    return (
      <SafeAreaView style={S.safe}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => setSchermata('lista')} style={S.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#22d3ee" />
          </TouchableOpacity>
          <Text style={S.headerTitle}>Dettaglio spesa</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {/* Foto scontrino */}
          {s.foto_base64 && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${s.foto_base64}` }}
              style={{ width: '100%', height: 220, borderRadius: 10, marginBottom: 16 }}
              resizeMode="cover"
            />
          )}

          {/* Card principale */}
          <View style={[S.detCard, { borderColor: cat.colore + '44' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={[S.catDot, { backgroundColor: cat.colore + '22', borderColor: cat.colore + '44' }]}>
                <Ionicons name={cat.icon} size={20} color={cat.colore} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#e2e8f0', fontWeight: '600', fontSize: 16 }}>{s.fornitore || 'Scontrino'}</Text>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{cat.label}</Text>
              </View>
              <Text style={{ color: cat.colore, fontFamily: 'SpaceMono-Bold', fontSize: 20 }}>{fmt(s.importo)}</Text>
            </View>

            {[
              ['Data', s.data_spesa + (s.ora_spesa ? ' · ' + s.ora_spesa : '')],
              ['Cantiere', s.cantiere_nome || '—'],
              ['Imponibile', fmt(s.imponibile || s.importo)],
              ['IVA', s.iva ? fmt(s.iva) : '—'],
            ].map(([k, v]) => (
              <View key={k} style={S.detRow}>
                <Text style={S.detLabel}>{k}</Text>
                <Text style={S.detVal}>{v}</Text>
              </View>
            ))}
          </View>

          {/* Box fiscale */}
          <View style={[S.fiscalBox, { borderColor: cat.colore + '44', marginTop: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="shield-checkmark" size={14} color={cat.colore} />
              <Text style={[S.fiscalText, { color: cat.colore }]}>
                {s.deducibile ? `Deducibile al ${s.percentuale_deducibilita}% → ${fmt(dedAmt)}` : 'Non deducibile'}
              </Text>
            </View>
            <Text style={S.fiscalNote}>{s.note_fiscali || cat.note}</Text>
          </View>

          {/* Stato approvazione */}
          <View style={[S.detCard, { marginTop: 12 }]}>
            <Text style={S.detLabel}>Stato approvazione</Text>
            <View style={[S.pill, {
              backgroundColor: s.stato === 'approvata' ? 'rgba(74,222,128,0.12)' : s.stato === 'rifiutata' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
              alignSelf: 'flex-start', marginTop: 6,
            }]}>
              <Text style={{ color: s.stato === 'approvata' ? '#4ade80' : s.stato === 'rifiutata' ? '#ef4444' : '#f59e0b', fontSize: 12, fontWeight: '600' }}>
                {s.stato === 'approvata' ? '✓ Approvata' : s.stato === 'rifiutata' ? '✗ Rifiutata' : '⏳ In attesa di approvazione'}
              </Text>
            </View>
            {s.approvato_da && <Text style={[S.detLabel, { marginTop: 6 }]}>da {s.approvato_da} il {s.approvato_il}</Text>}
          </View>

          {s.descrizione ? (
            <View style={[S.detCard, { marginTop: 12 }]}>
              <Text style={S.detLabel}>Note</Text>
              <Text style={{ color: '#e2e8f0', fontSize: 14, marginTop: 4 }}>{s.descrizione}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (schermata === 'nuova')     return renderNuova();
  if (schermata === 'dettaglio') return renderDettaglio();
  return renderLista();
}

// ─── STILI ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#0b1120' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#111827', borderBottomWidth: 1, borderBottomColor: '#1e3a4a', gap: 10 },
  headerTitle:  { flex: 1, color: '#e2e8f0', fontSize: 16, fontFamily: 'SpaceMono-Bold' },
  headerSub:    { color: '#94a3b8', fontSize: 11, marginTop: 1 },
  backBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1a2332', alignItems: 'center', justifyContent: 'center' },
  iconBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1a2332', alignItems: 'center', justifyContent: 'center' },
  saveBtn:      { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#22d3ee', borderRadius: 8, minWidth: 60, alignItems: 'center' },
  saveBtnText:  { color: '#0b1120', fontFamily: 'SpaceMono-Bold', fontSize: 13 },

  kpiRow:       { flexDirection: 'row', gap: 8, padding: 14 },
  kpiCard:      { flex: 1, backgroundColor: '#1a2332', borderRadius: 10, padding: 12, borderWidth: 1 },
  kpiLabel:     { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  kpiVal:       { fontSize: 15, fontFamily: 'SpaceMono-Bold', color: '#e2e8f0' },

  emptyWrap:    { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:    { color: '#94a3b8', fontSize: 15, marginTop: 8 },
  emptySubText: { color: '#475569', fontSize: 13 },

  speseCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a2332', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1e3a4a' },
  catDot:       { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  speseFornitore: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  speseInfo:    { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
  speseImporto: { fontFamily: 'SpaceMono-Bold', fontSize: 15 },
  pillRow:      { flexDirection: 'row', gap: 5 },
  pill:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  pillText:     { fontSize: 10, fontWeight: '600' },

  fab:          { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#22d3ee', alignItems: 'center', justifyContent: 'center', shadowColor: '#22d3ee', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

  formScroll:   { padding: 16 },
  fotoButtons:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
  fotoBtn:      { flex: 1, backgroundColor: '#1a2332', borderRadius: 10, borderWidth: 1, borderColor: '#1e3a4a', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
  fotoBtnText:  { color: '#22d3ee', fontSize: 13, fontWeight: '600' },
  fotoWrap:     { borderRadius: 10, overflow: 'hidden', marginBottom: 14, position: 'relative', height: 200 },
  fotoPreview:  { width: '100%', height: 200 },
  scanOverlay:  { position: 'absolute', inset: 0, backgroundColor: 'rgba(11,17,32,0.75)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  scanText:     { color: '#22d3ee', fontSize: 13, fontFamily: 'SpaceMono-Regular' },
  fotoRimuovi:  { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },

  claudeBadge:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(167,139,250,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', padding: 10, marginBottom: 14 },
  claudeText:   { color: '#a78bfa', fontSize: 12, flex: 1, lineHeight: 18 },

  fieldLabel:   { color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input:        { backgroundColor: '#1a2332', borderRadius: 8, borderWidth: 1, borderColor: '#1e3a4a', color: '#e2e8f0', fontSize: 14, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center' },

  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1e3a4a', backgroundColor: '#1a2332', marginRight: 6 },
  catChipText:  { color: '#94a3b8', fontSize: 12 },

  fiscalBox:    { backgroundColor: '#111827', borderRadius: 8, borderWidth: 1, padding: 10, gap: 4 },
  fiscalText:   { fontSize: 12, fontWeight: '600' },
  fiscalNote:   { color: '#475569', fontSize: 11, lineHeight: 16 },

  importiBox:   { backgroundColor: '#111827', borderRadius: 8, borderWidth: 1, borderColor: '#1e3a4a', padding: 12, marginTop: 8, gap: 6 },
  importiRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  importiLabel: { color: '#94a3b8', fontSize: 12 },
  importiVal:   { color: '#e2e8f0', fontSize: 13, fontFamily: 'SpaceMono-Regular' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: '#111827', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 4 },
  modalTitle:   { color: '#e2e8f0', fontFamily: 'SpaceMono-Bold', fontSize: 14, marginBottom: 8 },
  modalItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e3a4a' },

  detCard:      { backgroundColor: '#1a2332', borderRadius: 10, borderWidth: 1, borderColor: '#1e3a4a', padding: 14 },
  detRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0b1120' },
  detLabel:     { color: '#94a3b8', fontSize: 12 },
  detVal:       { color: '#e2e8f0', fontSize: 13, fontFamily: 'SpaceMono-Regular' },
});
