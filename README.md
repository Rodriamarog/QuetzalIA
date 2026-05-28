# 🪶 QuetzalIA

**Asistente legal con Retrieval-Augmented Generation (RAG) para jurisprudencia mexicana.**

Consulta más de 310,000 tesis jurisprudenciales del Poder Judicial de la Federación usando búsqueda semántica vectorial y un agente de IA que itera hasta encontrar las fuentes más relevantes.

---

## ¿Qué es QuetzalIA?

QuetzalIA implementa un sistema RAG (Retrieval-Augmented Generation) con las siguientes características:

- **Búsqueda semántica** con embeddings (`text-embedding-3-small`) en una base de datos de 310K+ tesis
- **Agente iterativo** que evalúa los resultados y refina la búsqueda hasta quedar satisfecho (máx. 3 iteraciones)
- **Reescritura de consultas** para manejar conversaciones multi-turno correctamente
- **Reranking por jerarquía legal** (Época, Tipo, Instancia, Año)
- **Panel de proceso RAG** que muestra visualmente cada paso de la búsqueda en tiempo real

---

## Requisitos

- Node.js 18+
- OpenAI API key
- URL y API key del servidor RAG en Hetzner

---

## Instalación

1. **Instala dependencias:**
   ```bash
   npm install
   ```

2. **Configura variables de entorno:**
   ```bash
   cp .env.local.example .env.local
   # Edita .env.local con tus claves
   ```

3. **Ejecuta en modo desarrollo:**
   ```bash
   npm run dev
   ```

4. **Abre en tu navegador:** [http://localhost:3000](http://localhost:3000)

---

## Arquitectura

```
Usuario (localhost:3000)
    ↓
Next.js App (frontend + API)
    ↓  POST /api/chat
    ├─ Reescritura de consulta  →  OpenAI gpt-4o-mini
    ├─ Búsqueda RAG             →  Servidor Hetzner :3002
    │       ↓  AgentController (loop iterativo)
    │       ↓  búsqueda semántica en pgvector (310K tesis)
    │       ↑  Evaluador LLM (SATISFECHO / REFINAR / AMPLIAR)
    └─ Generación de respuesta  →  OpenAI gpt-4o-mini (streaming)
    ↓
Respuesta streaming + metadatos RAG en headers HTTP
```

### Componentes principales

| Componente | Descripción |
|---|---|
| `app/api/chat/route.ts` | Ruta API: coordina reescritura, RAG y generación |
| `components/rag-process-panel.tsx` | Panel visual del proceso RAG (columna izquierda) |
| `components/chat-interface.tsx` | Chat con streaming (columna central) |
| `components/sources-sidebar.tsx` | Tesis consultadas con scores (columna derecha) |

---

## Stack tecnológico

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **Streaming:** Vercel AI SDK (`ai`, `@ai-sdk/react`)
- **LLM:** OpenAI gpt-4o-mini
- **Embeddings:** OpenAI text-embedding-3-small (1536 dims)
- **Vector DB:** PostgreSQL + pgvector
- **Agente RAG:** Express.js en Hetzner con AgentController iterativo

## Dependencias externas del sistema RAG

El sistema QuetzalIA depende de un servidor RAG externo desplegado en infraestructura Hetzner. Este backend especializado es responsable de realizar la recuperación semántica sobre más de 310,000 tesis jurisprudenciales almacenadas en PostgreSQL con pgvector.

La aplicación frontend desarrollada en Next.js se comunica con este servidor mediante peticiones HTTP seguras utilizando variables de entorno para proteger las credenciales y endpoints sensibles.

### Variables de entorno necesarias

```env
OPENAI_API_KEY=your_openai_key
RAG_API_URL=https://tu-servidor-rag.com
RAG_API_KEY=your_rag_key
```

### Funciones del servidor RAG

El backend RAG realiza las siguientes tareas:

- Generación de embeddings semánticos
- Búsqueda vectorial en PostgreSQL + pgvector
- Recuperación de tesis relevantes
- Evaluación iterativa de resultados
- Refinamiento automático de consultas
- Reranking jurídico de documentos
- Envío de contexto al modelo generativo

### Seguridad

Las API keys y URLs sensibles no se almacenan directamente dentro del código fuente. Todas las credenciales se manejan mediante variables de entorno utilizando archivos `.env.local`, evitando exponer información privada dentro del repositorio.

### Nota importante

La aplicación requiere que el servidor RAG se encuentre activo y accesible para funcionar correctamente. Si el backend no está disponible, las búsquedas jurídicas y la generación de respuestas no podrán completarse.

---

## ⚠️ Disclaimer

Algunas partes del proyecto fueron asistidas mediante herramientas de inteligencia artificial.

Las secciones asistidas fueron revisadas, comprendidas y adaptadas manualmente para cumplir con los objetivos académicos y técnicos del proyecto.

Las partes asistidas están identificadas con el siguiente icono:

`#⚠️`
