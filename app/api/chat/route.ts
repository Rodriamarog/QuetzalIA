import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import type { RagMetadata, TesisSource } from '@/lib/types'

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function rewriteQuery(
  userMessage: string,
  recentMessages: { role: string; content: string }[]
): Promise<{ rewrittenQuery: string; usedRewrite: boolean }> {
  if (userMessage.length > 500 || recentMessages.length === 0) {
    return { rewrittenQuery: userMessage, usedRewrite: false }
  }

  try {
    const contextStr = recentMessages
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content.substring(0, 200)}`)
      .join('\n')

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Reescribe el mensaje del usuario como una pregunta legal AUTÓNOMA Y COMPLETA que incluya todo el contexto necesario de la conversación.

INSTRUCCIONES:
- Mantén la consulta reescrita concisa pero completa (máximo 2-3 oraciones)
- Incluye el tema/área legal específica
- Incluye términos específicos de mensajes anteriores
- Escribe en español formal

CONTEXTO DE LA CONVERSACIÓN:
${contextStr}

MENSAJE ACTUAL DEL USUARIO:
"${userMessage}"

CONSULTA REESCRITA (autónoma y completa):`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    })

    const rewritten = response.choices[0]?.message?.content?.trim() || ''
    if (!rewritten || rewritten.length < 10) {
      return { rewrittenQuery: userMessage, usedRewrite: false }
    }

    return { rewrittenQuery: rewritten, usedRewrite: true }
  } catch {
    return { rewrittenQuery: userMessage, usedRewrite: false }
  }
}

function buildSystemPrompt(sources: TesisSource[]): string {
  const context = sources
    .map(
      (source, i) =>
        `[Fuente ${i + 1} - ID: ${source.id_tesis}]
Rubro: ${source.titulo}
Tipo: ${source.tipo || 'N/A'} | Época: ${source.epoca || 'N/A'} | Año: ${source.year || 'N/A'}
Similitud: ${source.similarity ? (source.similarity * 100).toFixed(1) + '%' : 'N/A'}

${source.texto || 'Sin texto disponible'}
---`
    )
    .join('\n\n')

  return `Eres QuetzalIA, un asistente legal experto en jurisprudencia mexicana. Tu función es ayudar a usuarios a entender y aplicar tesis jurisprudenciales del derecho mexicano.

INSTRUCCIONES GENERALES:
1. Responde en español formal y preciso
2. Cita las fuentes usando el formato [ID: XXXX] — SOLO el número dentro de los corchetes
3. Menciona la Época y Año FUERA de los corchetes, ejemplo: [ID: XXXX] de la Novena Época (2004)
4. Sé conciso pero completo
5. **CRÍTICO**: SOLO menciona tesis que aparecen en las fuentes proporcionadas. NUNCA inventes IDs, rubros o contenido de tesis.

CRITERIOS DE PRIORIZACIÓN:
1. **PRIORIZA TESIS RECIENTES**: Duodécima Época (2024+) > Undécima Época > épocas anteriores
2. **DETECTA CONTRADICCIONES TEMPORALES**: Si hay tesis recientes sobre el mismo tema, menciona que el criterio antiguo puede estar superado
3. **JERARQUÍA DE FUENTES**: Jurisprudencias > Tesis Aisladas; SCJN > Plenos > Tribunales Colegiados

IMPORTANTE — ACCESO A BASE DE DATOS:
- TIENES acceso a una base de datos con 310,000+ tesis jurisprudenciales mexicanas
- NUNCA digas "no tengo acceso a bases de datos externas" — SÍ TIENES ACCESO
- Basa tus respuestas EXCLUSIVAMENTE en las fuentes proporcionadas

FUENTES DISPONIBLES (ordenadas por relevancia):
${context}`
}

function extractText(message: any): string {
  // AI SDK v5 format: parts array
  if (message.parts) {
    const textPart = message.parts.find((p: any) => p.type === 'text')
    if (textPart?.text) return textPart.text
  }
  // Fallback: plain content string
  return message.content || ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages } = body as { messages: any[] }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 })
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: 'No user message found' }), { status: 400 })
    }

    const userMessageText = extractText(lastUserMessage)
    if (!userMessageText) {
      return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 })
    }

    // Build plain-text conversation history for context
    const conversationHistory = messages.slice(0, -1).map((m: any) => ({
      role: m.role as string,
      content: extractText(m),
    }))

    // Step 1: Rewrite query with context
    const { rewrittenQuery, usedRewrite } = await rewriteQuery(userMessageText, conversationHistory)

    // Step 2: Call Hetzner RAG API
    const hetznerUrl = process.env.HETZNER_RAG_URL || 'http://localhost:3002'
    const ragApiKey = process.env.RAG_API_KEY

    if (!ragApiKey) {
      return new Response(JSON.stringify({ error: 'RAG_API_KEY not configured' }), { status: 500 })
    }

    const searchResponse = await fetch(`${hetznerUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ragApiKey}`,
      },
      body: JSON.stringify({
        query: rewrittenQuery,
        userQuery: userMessageText,
      }),
    })

    if (!searchResponse.ok) {
      const errText = await searchResponse.text()
      console.error('[QuetzalIA] Hetzner search failed:', searchResponse.status, errText)
      return new Response(JSON.stringify({ error: 'RAG search failed' }), { status: 502 })
    }

    const searchResult = await searchResponse.json()
    const sources: TesisSource[] = (searchResult.sources || []).map((s: any) => ({
      id_tesis: s.id_tesis,
      titulo: s.titulo || s.rubro || '',
      texto: s.texto || '',
      epoca: s.epoca || '',
      tipo: s.tipo || s.tipo_tesis || '',
      year: s.year || s.anio || 0,
      similarity: s.similarity || 0,
      instancia: s.instancia || '',
    }))

    // Step 3: Build RAG metadata for the panel
    const ragMetadata: RagMetadata = {
      originalQuery: userMessageText,
      rewrittenQuery,
      usedRewrite,
      iterations: searchResult.iterations || 1,
      exitReason: searchResult.exitReason || 'unknown',
      cost: searchResult.cost || 0,
      embeddingCalls: searchResult.embeddingCalls || 0,
      llmCalls: searchResult.llmCalls || 0,
      queryHistory: searchResult.queryHistory || [rewrittenQuery],
    }

    // Step 4: Build messages for LLM
    const systemPrompt = buildSystemPrompt(sources)
    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessageText },
    ]

    // Step 5: Stream response
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: allMessages,
      temperature: 0.3,
    })

    // Encode metadata in headers
    const ragMetadataHeader = Buffer.from(JSON.stringify(ragMetadata)).toString('base64')
    const sourcesHeader = Buffer.from(JSON.stringify(sources)).toString('base64')

    return result.toUIMessageStreamResponse({
      headers: {
        'X-RAG-Metadata': ragMetadataHeader,
        'X-Sources-Data': sourcesHeader,
      },
    })
  } catch (error) {
    console.error('[QuetzalIA] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
