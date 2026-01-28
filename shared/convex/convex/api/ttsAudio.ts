/**
 * TTS audio cache API - thin layer for audio caching operations.
 */

import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import * as TtsAudio from "../model/ttsAudio"

/**
 * Get cached audio for a block/voice combination.
 */
export const getBlockAudio = query({
  args: {
    documentId: v.id("documents"),
    blockId: v.string(),
    voiceId: v.string(),
  },
  handler: (ctx, { documentId, blockId, voiceId }) =>
    TtsAudio.getBlockAudio(ctx, documentId, blockId, voiceId),
})

/**
 * Get variation text for a block (any voice).
 * Used to reuse LLM-generated text across different voices.
 */
export const getBlockVariationText = query({
  args: {
    documentId: v.id("documents"),
    blockId: v.string(),
  },
  handler: (ctx, { documentId, blockId }) =>
    TtsAudio.getBlockVariationText(ctx, documentId, blockId),
})

/**
 * Create a new audio cache record.
 */
export const createAudio = mutation({
  args: {
    documentId: v.id("documents"),
    blockId: v.string(),
    voiceId: v.string(),
    text: v.string(),
    storagePath: v.string(),
    durationMs: v.number(),
    sampleRate: v.number(),
    wordTimestamps: v.array(
      v.object({
        word: v.string(),
        startMs: v.number(),
        endMs: v.number(),
      }),
    ),
  },
  handler: (ctx, args) => TtsAudio.createAudio(ctx, args),
})
