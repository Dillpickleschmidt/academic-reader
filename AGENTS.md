# AGENTS.md - Guidelines for AI Coding Agents

This document provides guidelines for AI agents working in the academic-reader codebase.

## Project Overview

Academic Reader converts documents to HTML/Markdown using [Marker](https://github.com/datalab-to/marker). Supports PDF, DOCX, XLSX, PPTX, HTML, EPUB, and images.

**Stack:**
- Runtime: **Bun** (not Node.js/npm)
- Frontend: React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Convex
- Backend API: Hono + Bun
- Worker: Python 3.11, FastAPI, Marker-PDF (GPU)

## Build/Lint/Test Commands

### Root Commands (run from repo root)
```bash
bun install              # Install all dependencies
bun run dev              # Start dev environment (reads BACKEND_MODE from .env.dev)
bun run dev:local        # Dev with local Docker GPU worker
bun run dev:runpod       # Dev with Runpod backend
bun run dev:datalab      # Dev with Datalab API backend
bun run dev --dashboard  # Enable Convex dashboard at localhost:6791
bun run typecheck        # Typecheck all packages
bun run lint             # Lint frontend
bun run build            # Build frontend
```

### Package-Specific Commands
```bash
bun run --cwd frontend dev       # Vite dev server
bun run --cwd frontend lint      # ESLint
bun run --cwd api dev            # Watch mode server
bun run --cwd api typecheck      # TypeScript check
```

### Running Tests
**No test framework configured.** If adding tests, use Vitest (frontend/API) or pytest (worker).

## Code Style Guidelines

### Formatting (Prettier enforced)
- **No semicolons**, **double quotes**, **2-space indentation**
- **Trailing commas** in multi-line, **80 char print width**, **LF line endings**

### Import Organization
```typescript
// 1. Third-party packages
import { useState } from "react"
import { FileUp } from "lucide-react"

// 2. Path-aliased (frontend only, @/ -> ./src/)
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// 3. Relative imports
import { uploadFile } from "./api"
import type { ConversionJob } from "./types"  // Always use `import type` for types
```

### TypeScript Patterns
**Prefer `type` over `interface`** for most definitions:
```typescript
export type BackendType = "local" | "runpod" | "datalab"
export type ConversionInput = { fileId: string; outputFormat: OutputFormat }
```

**Use `interface` for contracts with methods:**
```typescript
export interface ConversionBackend {
  readonly name: string
  submitJob(input: ConversionInput): Promise<string>
}
```

**Avoid `any`** - use `unknown` for dynamic values.

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files (components) | PascalCase | `UploadPage.tsx` |
| Files (UI primitives) | kebab-case | `button.tsx` |
| Files (hooks) | camelCase | `useConversion.ts` |
| Components | PascalCase | `function UploadPage()` |
| Hooks | camelCase with `use` | `useConversion()` |
| Event handlers | `handle` prefix | `handleSubmit()` |
| Constants | SCREAMING_SNAKE | `API_URL` |
| Types | PascalCase | `ConversionJob` |

### Error Handling
```typescript
// Try-catch with type narrowing
try {
  const data = await api.uploadFile(file)
} catch (err) {
  setError(err instanceof Error ? err.message : "Upload failed")
}

// HTTP errors
if (!res.ok) {
  const err = await res.json()
  throw new Error(err.detail || "Upload failed")
}

// API route errors
if (!file) return c.json({ error: "File not found" }, { status: 404 })
```

### React Patterns
**Hook organization:** Context -> State -> Refs -> Callbacks -> Memos -> Effects

**Use `cn()` for className composition:**
```typescript
<div className={cn("flex w-full", isActive && "bg-primary", className)} />
```

## Architecture

Bun workspace monorepo with three packages:

- **frontend/** - React + Vite + Tailwind. Convex for realtime DB, better-auth for auth. AI SDK for chat. Path alias `@/` -> `src/`.
- **api/** - Hono server. Routes to backends (local/runpod/datalab). S3-compatible storage (MinIO locally, R2 prod).
- **worker/** - Python FastAPI with Marker for local GPU processing.

### Backend Modes (set `BACKEND_MODE` in `.env.dev`)
- `local` - Local GPU via Docker (requires NVIDIA Docker)
- `runpod` - Runpod cloud GPU with S3/MinIO storage
- `datalab` - Datalab API (no GPU required)

### API Endpoints
- `POST /api/upload` - Upload file
- `POST /api/convert/:fileId` - Start conversion job
- `GET /api/jobs/:jobId/stream` - SSE progress stream
- `GET /api/download/:jobId` - Download converted result
- `/api/auth/*` - Auth (proxied to Convex)

## Directory Structure
```
├── api/src/              # Hono API server
│   ├── routes/           # API endpoints
│   ├── backends/         # Backend adapters (interface.ts defines contract)
│   └── storage/          # Storage adapters (s3, temp)
├── frontend/src/         # React SPA
│   ├── components/ui/    # shadcn/ui primitives (base-vega style)
│   └── hooks/            # Custom React hooks
├── frontend/convex/      # Convex functions + better-auth integration
├── worker/               # Python GPU worker (Docker)
└── scripts/              # Dev scripts
```

## Key Patterns

- **Backend factory:** `createBackend()` in `api/src/backends/factory.ts`
- **Convex + better-auth:** Auth integration in `frontend/convex/`
- **AI SDK:** `@ai-sdk/react` and `ai` packages for chat functionality
- **Docker Compose profiles:** Control which services run per backend mode

## Important Notes

- Always use `bun`, never `npm` or `yarn`
- Frontend path alias `@/` maps to `./src/`
- Three backend modes: local (Docker GPU), runpod (serverless), datalab (API)
- Convex runs self-hosted in Docker for auth
