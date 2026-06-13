import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/solid";

export const authClient = createAuthClient({
	baseURL:
		typeof window === "undefined"
			? "/api/auth"
			: `${window.location.origin}/api/auth`,
	plugins: [convexClient()],
});
