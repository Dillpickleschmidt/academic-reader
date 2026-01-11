/**
 * Result type pattern for explicit error handling.
 * Based on: https://gist.github.com/t3dotgg/a486c4ae66d32bf17c09c73609dacc5b
 */

export type TryCatchSuccess<T> = { success: true; data: T }
export type TryCatchError = { success: false; error: unknown }
export type TryCatchResult<T> = TryCatchSuccess<T> | TryCatchError

/**
 * Wraps a promise to return a Result type instead of throwing.
 * Enables clean error handling without try-catch blocks.
 *
 * @example
 * const result = await tryCatch(fetch('/api/user'))
 * if (!result.success) {
 *   console.error(result.error)
 *   return
 * }
 * // result.data is now T
 */
export async function tryCatch<T>(
  operation: Promise<T> | (() => Promise<T>)
): Promise<TryCatchResult<T>> {
  try {
    const data =
      typeof operation === "function" ? await operation() : await operation
    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Extract a message string from an unknown error.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
