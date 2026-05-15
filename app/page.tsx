'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sparkles, Send, Loader2, BookOpen, Info } from 'lucide-react'
import { MarkdownMessage } from '@/components/markdown-message'
import { LoadingDots } from '@/components/loading-dots'
import { useMessageAnimation } from '@/hooks/use-message-animation'
import type { TesisSource } from '@/lib/types'

// ── Tesis detail modal (uses inline data — no API call needed) ──────────────

function TesisModal({
  source,
  open,
  onOpenChange,
}: {
  source: TesisSource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {source ? `Tesis ${source.id_tesis}` : ''}
          </DialogTitle>
        </DialogHeader>
        {source && (
          <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {source.tipo && <Badge variant="default">{source.tipo}</Badge>}
                {source.epoca && <Badge variant="outline">{source.epoca}</Badge>}
                {source.year && <Badge variant="secondary">{source.year}</Badge>}
                {source.instancia && <Badge variant="outline">{source.instancia}</Badge>}
                <Badge variant="secondary">
                  {((source.similarity ?? 0) * 100).toFixed(0)}% relevancia
                </Badge>
              </div>
              <div>
                <h3 className="font-semibold text-base mb-2">Rubro</h3>
                <p className="text-sm">{source.titulo}</p>
              </div>
              {source.texto && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Texto</h3>
                  <p className="text-sm whitespace-pre-wrap">{source.texto}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Chat message ───────────────────────────────────────────────────────────

const ChatMessage = memo(function ChatMessage({
  message,
  index,
  animatingIndex,
  onRefSet,
  onTesisClick,
}: {
  message: any
  index: number
  animatingIndex: number | null
  onRefSet: (index: number, el: HTMLDivElement | null) => void
  onTesisClick?: (tesisId: number) => void
}) {
  const isAnimating = animatingIndex === index
  const isUser = message.role === 'user'

  return (
    <div
      ref={(el) => onRefSet(index, el)}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} ${
        isAnimating
          ? isUser
            ? 'animate-in fade-in slide-in-from-right-2 duration-500'
            : 'animate-in fade-in slide-in-from-bottom-2 duration-500'
          : ''
      }`}
    >
      <div
        className={`max-w-[80%] rounded-lg p-4 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        {message.parts?.map((part: any, idx: number) =>
          part.type === 'text' ? (
            <MarkdownMessage
              key={idx}
              content={part.text}
              role={message.role as 'user' | 'assistant'}
              onTesisClick={onTesisClick}
            />
          ) : null
        )}
      </div>
    </div>
  )
})

ChatMessage.displayName = 'ChatMessage'

// ── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [sources, setSources] = useState<TesisSource[]>([])
  const [sourcesAnimating, setSourcesAnimating] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [selectedSource, setSelectedSource] = useState<TesisSource | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map())
  const shouldAutoScrollRef = useRef(true)
  const prevSourcesLengthRef = useRef(0)
  const prevMessageCountRef = useRef(0)

  const handleUserScroll = useCallback(() => {
    shouldAutoScrollRef.current = false
  }, [])

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = messageRefsMap.current.get(messageIndex)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleMessageRefSet = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) messageRefsMap.current.set(index, el)
    else messageRefsMap.current.delete(index)
  }, [])

  const { messages, sendMessage, status, setMessages } = useChat({
    experimental_throttle: 100,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      async fetch(input, init) {
        const response = await fetch(input, init)

        const srcHeader = response.headers.get('X-Sources-Data')
        if (srcHeader) {
          try {
            const binary = atob(srcHeader)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const decoded = JSON.parse(new TextDecoder('utf-8').decode(bytes)) as TesisSource[]
            setSources(decoded)
          } catch {/* ignore */}
        }

        return response
      },
    }),
  })

  const isLoading = status === 'submitted'
  const animatingIndex = useMessageAnimation(messages.length)

  // Scroll listeners
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const viewport = root.querySelector('[data-radix-scroll-area-viewport]')
    if (!viewport) return
    viewport.addEventListener('wheel', handleUserScroll, { passive: true })
    return () => viewport.removeEventListener('wheel', handleUserScroll)
  }, [handleUserScroll])

  // Auto-scroll on new messages
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }))
  }, [messages])

  // Scroll to user message when sent
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const last = messages[messages.length - 1]
      if (last?.role === 'user') {
        requestAnimationFrame(() => scrollToMessage(messages.length - 1))
      }
      prevMessageCountRef.current = messages.length
    }
  }, [messages.length, scrollToMessage])

  // Animate sources when they arrive
  useEffect(() => {
    if (sources.length > prevSourcesLengthRef.current && sources.length > 0) {
      setSourcesAnimating(true)
      const t = setTimeout(() => setSourcesAnimating(false), 400)
      prevSourcesLengthRef.current = sources.length
      return () => clearTimeout(t)
    }
    prevSourcesLengthRef.current = sources.length
  }, [sources.length])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputValue.trim() || status === 'streaming' || isLoading) return
    const text = inputValue
    setInputValue('')
    shouldAutoScrollRef.current = true
    await sendMessage({ text })
  }

  const handleTesisClick = useCallback((tesisId: number) => {
    const src = sources.find((s) => s.id_tesis === tesisId) ?? null
    setSelectedSource(src)
    setModalOpen(true)
  }, [sources])

  const startNew = () => {
    setMessages([])
    setSources([])
    prevSourcesLengthRef.current = 0
    prevMessageCountRef.current = 0
    shouldAutoScrollRef.current = true
  }

  const EXAMPLES = [
    '¿Qué es el principio pro persona?',
    'Jurisprudencia sobre amparo directo',
    'Estándar probatorio en materia penal',
    'Tesis sobre derechos laborales',
  ]

  return (
    <div className="h-full p-6">
      <div className="flex gap-4 h-full">

        {/* ── Left sidebar ─────────────────────────────────────────── */}
        <div className="w-80 flex flex-col gap-4 h-full overflow-hidden">

          {/* Branding card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <span className="text-xl">🪶</span>
                QuetzalIA
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Asistente legal con RAG para jurisprudencia mexicana
              </p>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                310,000+ tesis jurisprudenciales
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
                onClick={startNew}
              >
                Nueva conversación
              </Button>
            </CardContent>
          </Card>

          {/* RAG info card */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="w-4 h-4" />
                Cómo funciona el RAG
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 text-xs text-muted-foreground">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary">1</span>
                  <p><strong className="text-foreground">Reescritura</strong> — el sistema convierte tu pregunta en una consulta autónoma con contexto completo.</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary">2</span>
                  <p><strong className="text-foreground">Búsqueda semántica</strong> — se generan embeddings y se busca por similitud vectorial en pgvector.</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary">3</span>
                  <p><strong className="text-foreground">Agente iterativo</strong> — un LLM evalúa los resultados y decide si refinar, ampliar o ya está satisfecho (máx. 3 iteraciones).</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary">4</span>
                  <p><strong className="text-foreground">Generación</strong> — se produce una respuesta citando las fuentes por ID de tesis.</p>
                </div>
              </div>
              <div className="border-t pt-3 space-y-1">
                <p className="font-medium text-foreground">Modelo</p>
                <p>gpt-4o-mini · text-embedding-3-small</p>
                <p className="font-medium text-foreground mt-2">Base de datos</p>
                <p>PostgreSQL + pgvector · Poder Judicial de la Federación</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Center: chat ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Card className="flex-1 flex flex-col h-full">
            <CardHeader className="border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                <div>
                  <CardTitle>Asistente Legal de Tesis</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pregunta sobre jurisprudencia mexicana
                  </p>
                </div>
              </div>
            </CardHeader>

            {/* Messages */}
            <ScrollArea className="flex-1 px-6" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <h3 className="text-lg font-semibold mb-2">¿En qué puedo ayudarte hoy?</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Pregunta sobre tesis jurisprudenciales, criterios de la SCJN,
                    o casos específicos de derecho mexicano.
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-2xl">
                    {EXAMPLES.map((ex, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="text-left h-auto p-3 cursor-pointer"
                        onClick={() => setInputValue(ex)}
                      >
                        <div className="text-sm">{ex}</div>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 py-4">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      index={index}
                      animatingIndex={animatingIndex}
                      onRefSet={handleMessageRefSet}
                      onTesisClick={handleTesisClick}
                    />
                  ))}
                  {isLoading && <LoadingDots isSearching={true} />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-4">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Escribe tu pregunta sobre tesis jurisprudenciales..."
                  disabled={isLoading || status === 'streaming'}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={isLoading || status === 'streaming' || !inputValue.trim()}
                >
                  {isLoading || status === 'streaming' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>

        {/* ── Right: sources ───────────────────────────────────────── */}
        {sources.length > 0 && (
          <div className={`w-96 h-full overflow-hidden ${sourcesAnimating ? 'animate-in fade-in slide-in-from-right-4 duration-400' : ''}`}>
            <Card className="h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Fuentes Consultadas
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-3">
                    {sources.map((source, i) => (
                      <Card
                        key={i}
                        className="cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => handleTesisClick(source.id_tesis)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <Badge variant="secondary" className="text-xs">
                              {((source.similarity ?? 0) * 100).toFixed(0)}% relevancia
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              ID: {source.id_tesis}
                            </span>
                          </div>
                          <h4 className="font-medium text-sm mb-2 line-clamp-2">
                            {source.titulo}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {source.tipo && (
                              <Badge variant="outline" className="text-xs">{source.tipo}</Badge>
                            )}
                            {source.year && <span>{source.year}</span>}
                            {source.epoca && <span>{source.epoca}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Tesis detail modal */}
      <TesisModal
        source={selectedSource}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
