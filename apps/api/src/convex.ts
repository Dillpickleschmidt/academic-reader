import { api } from "@academic-reader/convex/api";
import { ConvexHttpClient } from "convex/browser";

export { api };

export function createConvexHttpClient(authToken?: string) {
	const client = new ConvexHttpClient(requireEnv("CONVEX_URL"), {
		skipConvexDeploymentUrlCheck: true,
		logger: false,
	});

	if (authToken) {
		client.setAuth(authToken);
	}

	return client;
}

export function readApiToConvexServiceSecret() {
	return requireEnv("API_TO_CONVEX_SERVICE_SECRET");
}

function requireEnv(key: string) {
	const value = process.env[key]?.trim();

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}
