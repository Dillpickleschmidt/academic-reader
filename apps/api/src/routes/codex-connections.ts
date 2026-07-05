import { loginOpenAICodexDeviceCode } from "@earendil-works/pi-ai/oauth";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
	codexCredentialAccountId,
	encryptCodexCredential,
} from "../codex-credentials";
import { api, createConvexHttpClient } from "../convex";

export const codexConnectionsRoute = new Hono();

codexConnectionsRoute.post("/connect", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	return streamSSE(c, async (stream) => {
		const keepAlive = setInterval(() => {
			void stream.writeSSE({ event: "ping", data: "{}" });
		}, 15_000);

		try {
			const credentials = await loginOpenAICodexDeviceCode({
				onDeviceCode: (info) => {
					void stream.writeSSE({
						event: "device_code",
						data: JSON.stringify(info),
					});
				},
				signal: c.req.raw.signal,
			});
			const credential = { ...credentials, type: "oauth" as const };

			const accountId = codexCredentialAccountId(credential);
			await createConvexHttpClient(authToken).mutation(
				api.api.codexConnections.upsertForReader,
				{
					...(accountId !== undefined ? { accountId } : {}),
					encryptedCredential: encryptCodexCredential(credential),
				},
			);
			await stream.writeSSE({ event: "connected", data: "{}" });
		} catch (error) {
			await stream.writeSSE({
				event: "connection_error",
				data: JSON.stringify({ error: errorMessage(error) }),
			});
		} finally {
			clearInterval(keepAlive);
		}
	});
});

function bearerToken(authorizationHeader: string | undefined) {
	const prefix = "Bearer ";

	if (!authorizationHeader?.startsWith(prefix)) {
		return null;
	}

	return authorizationHeader.slice(prefix.length).trim() || null;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
