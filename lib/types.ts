export interface RagMetadata {
  originalQuery: string
  rewrittenQuery: string
  usedRewrite: boolean
  iterations: number
  exitReason: string
  cost: number
  embeddingCalls: number
  llmCalls: number
  queryHistory: string[]
}

export interface TesisSource {
  id_tesis: number
  titulo: string
  texto: string
  epoca?: string
  tipo?: string
  year?: number
  similarity?: number
  instancia?: string
}
