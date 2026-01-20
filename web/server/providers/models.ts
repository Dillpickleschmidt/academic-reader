/**
 * Model provider abstraction for easy swapping between providers.
 * Currently supports Google (Gemini), designed for easy OpenRouter addition.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModel } from "ai"
import { env } from "../env"

export type ChatProvider = "google" | "openrouter"

interface ModelConfig {
  provider: ChatProvider
  chatModel: string
  embeddingModel: string
}

function getConfig(): ModelConfig {
  if (env.AI_PROVIDER === "openrouter") {
    return {
      provider: "openrouter",
      chatModel: env.OPENROUTER_MODEL,
      // OpenRouter doesn't support embeddings - always use Google
      embeddingModel: "text-embedding-004",
    }
  }

  return {
    provider: "google",
    chatModel: env.GOOGLE_CHAT_MODEL,
    embeddingModel: "text-embedding-004",
  }
}

/**
 * Create a chat model instance.
 * Defaults to Google Gemini, can be switched to OpenRouter via AI_PROVIDER env var.
 */
export function createChatModel(): LanguageModel {
  const config = getConfig()

  if (config.provider === "openrouter") {
    // OpenRouter support - uncomment when needed:
    // import { createOpenAI } from "@ai-sdk/openai"
    // const openrouter = createOpenAI({
    //   apiKey: env.OPENROUTER_API_KEY,
    //   baseURL: "https://openrouter.ai/api/v1",
    // })
    // return openrouter(config.chatModel)

    // For now, fall back to Google
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
    return google(config.chatModel)
  }

  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
  return google(config.chatModel)
}

/**
 * Create an embedding model instance.
 * Always uses Google text-embedding-004 (768 dimensions).
 */
export function createEmbeddingModel() {
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
  return google.textEmbeddingModel("text-embedding-004")
}

/**
 * Get the current model configuration (for logging/debugging).
 */
export function getModelConfig(): ModelConfig {
  return getConfig()
}
