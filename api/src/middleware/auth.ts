import { createMiddleware } from "hono/factory"
import { getCookie } from "hono/cookie"
import type { Env } from "../types"

// Internal Docker network URL for Convex site (auth endpoints)
// Override with CONVEX_SITE_URL env var if hosting Convex separately (untested)
const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL || "http://convex-backend:3211"

export const requireAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    // Cookie name has __Secure- prefix in production (HTTPS)
    const secureCookieName = "__Secure-better-auth.session_token"
    const devCookieName = "better-auth.session_token"

    let sessionToken = getCookie(c, secureCookieName)
    let cookieName = secureCookieName

    if (!sessionToken) {
      sessionToken = getCookie(c, devCookieName)
      cookieName = devCookieName
    }

    if (!sessionToken) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/api/auth/get-session`, {
        headers: { Cookie: `${cookieName}=${sessionToken}` },
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return c.json({ error: "Unauthorized" }, 401)
      }

      const session = (await response.json()) as { user?: unknown }
      if (!session?.user) {
        return c.json({ error: "Unauthorized" }, 401)
      }

      await next()
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return c.json({ error: "Auth service timeout" }, 504)
      }
      if (error instanceof Error && error.name === "AbortError") {
        return c.json({ error: "Auth service timeout" }, 504)
      }
      console.error("Auth validation error:", error)
      return c.json({ error: "Auth service unavailable" }, 502)
    }
  },
)
