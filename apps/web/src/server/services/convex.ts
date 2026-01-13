/**
 * Convex HTTP client utilities for server-side mutations/queries.
 */
import { ConvexHttpClient } from "convex/browser"
import { getToken } from "@convex-dev/better-auth/utils"

/**
 * Create an authenticated Convex client using session cookies from request headers.
 * Returns null if no valid session token is found.
 */
export async function createAuthenticatedConvexClient(
  headers: Headers,
): Promise<ConvexHttpClient | null> {
  // Token endpoint is served by Convex HTTP (better-auth routes)
  const convexHttpUrl = process.env.CONVEX_HTTP_URL || "http://localhost:3211"
  const { token } = await getToken(convexHttpUrl, headers)
  if (!token) return null

  const convexUrl = process.env.CONVEX_SITE_URL || "http://localhost:3210"
  const client = new ConvexHttpClient(convexUrl)
  client.setAuth(token)
  return client
}
