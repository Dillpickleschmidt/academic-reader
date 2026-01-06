import { createAuthClient } from "better-auth/react"
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"

const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL
if (!convexSiteUrl || typeof convexSiteUrl !== "string") {
  throw new Error("Missing required environment variable: VITE_CONVEX_SITE_URL")
}

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [convexClient(), crossDomainClient()],
})
