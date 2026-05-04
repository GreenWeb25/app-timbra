import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
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
        if (!GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'GEMINI_API_KEY non configurata' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        const { imageBase64 } = await req.json()
        if (!imageBase64) {
            return new Response(JSON.stringify({ error: 'Nessuna immagine fornita' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        const payload = {
            contents: [{
                parts: [
                    { text: "Analizza questa fattura/scontrino. Restituisci SOLO un oggetto JSON con: 'fornitore' (nome azienda), 'importo' (numero decimale del NETTO A PAGARE), 'descrizione' (elenco prodotti). Usa null se mancano dati. Non aggiungere altro testo." },
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
        if (result.error) {
            return new Response(JSON.stringify({ error: `Gemini: ${result.error.message}` }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text
        if (!textResponse) {
            return new Response(JSON.stringify({ error: 'Risposta AI vuota' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        const jsonString = textResponse.replace(/```json|```/g, "").trim()
        const data = JSON.parse(jsonString)
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        return new Response(JSON.stringify({ error: `[SERVER] ${error.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
