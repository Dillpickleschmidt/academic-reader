# API Routes

## Upload & Conversion
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| POST | /api/upload | Optional | upload.ts | Upload file directly |
| POST | /api/upload-url | Optional | upload.ts | Get presigned URL |
| POST | /api/fetch-url | No | upload.ts | Fetch from external URL |
| POST | /api/convert/:fileId | No | convert.ts | Start conversion |
| POST | /api/warm-models | No | convert.ts | Warm model cache (local) |

## Jobs
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| GET | /api/jobs/:jobId/stream | No | jobs.ts | SSE job progress |
| POST | /api/jobs/:jobId/cancel | No | jobs.ts | Cancel job |

## Documents
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| POST | /api/documents/persist | Yes | persist.ts | Save to Convex |
| POST | /api/documents/:id/embeddings | Yes | document-embeddings.ts | Generate embeddings |
| GET | /api/saved-documents/:id | Yes | saved-documents.ts | Load document |
| DELETE | /api/saved-documents/:id | Yes | saved-documents.ts | Delete document |
| GET | /api/files/:fileId/download | No | download.ts | Download as HTML |

## AI Features
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| POST | /api/chat | Yes | chat.ts | Chat with RAG |

## TTS
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| POST | /api/tts/rewrite | Yes | tts-rewrite.ts | Prepare text for TTS |
| POST | /api/tts/chunk | Yes | tts.ts | Synthesize audio |
| GET | /api/tts/voices | No | tts.ts | List voices |
| POST | /api/tts/unload | No | tts.ts | Unload model |

## System
| Method | Path | Auth | File | Description |
|--------|------|------|------|-------------|
| GET | /api/health | No | server.ts | Health check |
| ALL | /api/auth/* | - | server.ts | Auth proxy to Convex |
