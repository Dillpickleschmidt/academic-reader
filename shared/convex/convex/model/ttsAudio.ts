/**
 * TTS audio cache model - stores synthesized audio metadata for reuse.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { requireAuth } from "./auth"

export interface WordTimestamp {
  word: string
  startMs: number
  endMs: number
}

export interface AudioRecord {
  text: string
  storagePath: string
  durationMs: number
  sampleRate: number
  wordTimestamps: WordTimestamp[]
}

export interface CreateAudioInput {
  documentId: Id<"documents">
  blockId: string
  voiceId: string
  text: string
  storagePath: string
  durationMs: number
  sampleRate: number
  wordTimestamps: WordTimestamp[]
}

/**
 * Get cached audio for a block/voice combination.
 * Returns null if not cached.
 */
export async function getBlockAudio(
  ctx: QueryCtx,
  documentId: Id<"documents">,
  blockId: string,
  voiceId: string,
): Promise<AudioRecord | null> {
  const user = await requireAuth(ctx)
  const doc = await ctx.db.get(documentId)

  if (!doc) throw new Error("Document not found")
  if (doc.userId !== user._id) throw new Error("Unauthorized")

  const record = await ctx.db
    .query("ttsAudio")
    .withIndex("by_document_block_voice", (q) =>
      q.eq("documentId", documentId).eq("blockId", blockId).eq("voiceId", voiceId),
    )
    .first()

  if (!record) return null

  return {
    text: record.text,
    storagePath: record.storagePath,
    durationMs: record.durationMs,
    sampleRate: record.sampleRate,
    wordTimestamps: record.wordTimestamps,
  }
}

/**
 * Get variation text for a block (any voice).
 * Used to reuse LLM-generated text across different voices.
 */
export async function getBlockVariationText(
  ctx: QueryCtx,
  documentId: Id<"documents">,
  blockId: string,
): Promise<string | null> {
  const user = await requireAuth(ctx)
  const doc = await ctx.db.get(documentId)

  if (!doc) throw new Error("Document not found")
  if (doc.userId !== user._id) throw new Error("Unauthorized")

  const record = await ctx.db
    .query("ttsAudio")
    .withIndex("by_document_block_voice", (q) =>
      q.eq("documentId", documentId).eq("blockId", blockId),
    )
    .first()

  return record?.text ?? null
}

/**
 * Create a new audio cache record.
 */
export async function createAudio(
  ctx: MutationCtx,
  input: CreateAudioInput,
): Promise<Id<"ttsAudio">> {
  const user = await requireAuth(ctx)
  const doc = await ctx.db.get(input.documentId)

  if (!doc) throw new Error("Document not found")
  if (doc.userId !== user._id) throw new Error("Unauthorized")

  return ctx.db.insert("ttsAudio", {
    documentId: input.documentId,
    blockId: input.blockId,
    voiceId: input.voiceId,
    text: input.text,
    storagePath: input.storagePath,
    durationMs: input.durationMs,
    sampleRate: input.sampleRate,
    wordTimestamps: input.wordTimestamps,
  })
}

/**
 * Delete all audio records for a document.
 */
export async function deleteDocumentAudio(
  ctx: MutationCtx,
  documentId: Id<"documents">,
): Promise<number> {
  const records = await ctx.db
    .query("ttsAudio")
    .withIndex("by_document_block_voice", (q) => q.eq("documentId", documentId))
    .collect()

  await Promise.all(records.map((r) => ctx.db.delete(r._id)))

  return records.length
}
