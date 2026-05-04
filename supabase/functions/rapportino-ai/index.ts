import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

    try {
        if (!GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'GEMINI_API_KEY non configurata' }), {
                status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
            })
        }

        const { mode, audioBase64, imageBase64, mimeType } = await req.json()

        // ── MODALITÀ TRASCRIZIONE AUDIO ──────────────────────────────
        if (mode === 'transcribe') {
            if (!audioBase64) {
                return new Response(JSON.stringify({ error: 'Nessun audio fornito' }), {
                    status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
                })
            }
            const payload = {
                contents: [{
                    parts: [
                        {
                            text: `Sei un assistente per un'azienda edile italiana. 
Trascrivi il seguente messaggio vocale di un operaio che descrive i lavori eseguiti in cantiere.
Restituisci SOLO un oggetto JSON con:
- "trascrizione": il testo trascritto pulito dell'audio
- "lavorazione": la categoria più appropriata tra: Muratura, Intonaco, Cappotto Termico, Demolizione, Posa Pavimenti, Impianti, Tinteggiatura, Posa Infissi, Copertura/Tetto, Altro
Non aggiungere altro testo fuori dal JSON.`
                        },
                        { inline_data: { mime_type: mimeType || 'audio/m4a', data: audioBase64 } }
                    ]
                }]
            }

            const res = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error.message)

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const cleaned = text.replace(/```json|```/g, '').trim()
            const data = JSON.parse(cleaned)
            return new Response(JSON.stringify(data), {
                headers: { ...cors, 'Content-Type': 'application/json' }
            })
        }

        // ── MODALITÀ ANALISI FOTO ────────────────────────────────────
        if (mode === 'analyze_photo') {
            if (!imageBase64) {
                return new Response(JSON.stringify({ error: 'Nessuna immagine fornita' }), {
                    status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
                })
            }
            const payload = {
                contents: [{
                    parts: [
                        {
                            text: `Sei un assistente per un'azienda edile italiana.
Analizza questa foto di un cantiere edile.
Restituisci SOLO un oggetto JSON con:
- "didascalia": una breve descrizione tecnica in italiano (massimo 2 frasi) di cosa si vede nella foto
Non aggiungere altro testo fuori dal JSON.`
                        },
                        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                    ]
                }]
            }

            const res = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error.message)

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const cleaned = text.replace(/```json|```/g, '').trim()
            const data = JSON.parse(cleaned)
            return new Response(JSON.stringify(data), {
                headers: { ...cors, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Modalità non riconosciuta. Usa "transcribe" o "analyze_photo".' }), {
            status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: `[SERVER] ${error.message}` }), {
            status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        })
    }
})
