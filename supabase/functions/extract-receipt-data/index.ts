import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// ✅ Uso gemini-1.5-flash per la massima compatibilità e stabilità
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurata')

        const { imageBase64 } = await req.json()
        if (!imageBase64) throw new Error('Nessuna immagine fornita')

        console.log(`[OCR] Ricevuta immagine: ${imageBase64.length} caratteri`);

        const payload = {
            contents: [{
                parts: [
                    { text: "Analizza questa fattura/scontrino. Restituisci SOLO un oggetto JSON con: 'fornitore' (nome azienda fornitore), 'importo' (numero decimale del NETTO A PAGARE o TOTALE DOCUMENTO, non l'imponibile senza IVA), 'descrizione' (prodotti separati da virgola). Usa null se mancano. Nessun testo aggiuntivo." },
                    { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
                ]
            }]
        }

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        const result = await response.json()
        if (result.error) throw new Error(`Gemini Error: ${result.error.message}`)

        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text
        if (!textResponse) throw new Error('Risposta AI vuota')

        return new Response(textResponse, {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Server Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
