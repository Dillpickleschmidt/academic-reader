/**
 * Convex HTTP client utilities for server-side mutations/queries.
 */
import { ConvexHttpClient } from "convex/browser"
import { getToken } from "@convex-dev/better-auth/utils"
import { env } from "../env"

/**
 * Create an authenticated Convex client using session cookies from request headers.
 * Returns null if no valid session token is found.
 */
export async function createAuthenticatedConvexClient(
  headers: Headers,
): Promise<ConvexHttpClient | null> {
  // Token endpoint is served by Convex HTTP (better-auth routes)
  const { token } = await getToken(env.CONVEX_HTTP_URL, headers)
  if (!token) return null

  const client = new ConvexHttpClient(env.CONVEX_SITE_URL)
  client.setAuth(token)
  return client
}
