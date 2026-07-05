import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";

export interface EncryptedCodexCredential {
	ciphertext: string;
	iv: string;
	tag: string;
}

export function encryptCodexCredential(
	credential: Credential,
): EncryptedCodexCredential {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", codexEncryptionKey(), iv);
	const plaintext = Buffer.from(JSON.stringify(credential), "utf8");
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

	return {
		ciphertext: ciphertext.toString("base64"),
		iv: iv.toString("base64"),
		tag: cipher.getAuthTag().toString("base64"),
	};
}

export function decryptCodexCredential(
	encrypted: EncryptedCodexCredential,
): Credential {
	const decipher = createDecipheriv(
		"aes-256-gcm",
		codexEncryptionKey(),
		Buffer.from(encrypted.iv, "base64"),
	);
	decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
		decipher.final(),
	]);
	const credential = JSON.parse(plaintext.toString("utf8"));

	if (!isCodexCredential(credential)) {
		throw new Error("Stored Codex credential is invalid");
	}
	return credential;
}

export function codexCredentialAccountId(credential: Credential) {
	const value = (credential as Record<string, unknown>).accountId;
	return typeof value === "string" && value.trim() ? value : undefined;
}

export function createCodexCredentialStore(readerId: string): CredentialStore {
	return {
		read: async (providerId) => {
			if (providerId !== "openai-codex") return undefined;
			const connection = await createConvexHttpClient().query(
				api.api.codexConnections.getForReaderFromApi,
				{
					serviceSecret: readApiToConvexServiceSecret(),
					readerId,
				},
			);
			return connection
				? decryptCodexCredential(connection.encryptedCredential)
				: undefined;
		},
		modify: async (providerId, fn) => {
			if (providerId !== "openai-codex") return undefined;
			const current =
				await createCodexCredentialStore(readerId).read(providerId);
			const next = await fn(current);
			if (!next) return current;

			const accountId = codexCredentialAccountId(next);
			await createConvexHttpClient().mutation(
				api.api.codexConnections.upsertForReaderFromApi,
				{
					serviceSecret: readApiToConvexServiceSecret(),
					readerId,
					...(accountId !== undefined ? { accountId } : {}),
					encryptedCredential: encryptCodexCredential(next),
				},
			);
			return next;
		},
		delete: async (providerId) => {
			if (providerId !== "openai-codex") return;
			await createConvexHttpClient().mutation(
				api.api.codexConnections.deleteForReaderFromApi,
				{
					serviceSecret: readApiToConvexServiceSecret(),
					readerId,
				},
			);
		},
	};
}

function codexEncryptionKey() {
	const value = process.env.CODEX_CONNECTION_ENCRYPTION_KEY?.trim();
	if (!value) throw new Error("CODEX_CONNECTION_ENCRYPTION_KEY is required");

	const hex = /^[0-9a-f]{64}$/i.test(value)
		? Buffer.from(value, "hex")
		: undefined;
	if (hex?.length === 32) return hex;

	const base64 = Buffer.from(value, "base64");
	if (base64.length === 32) return base64;

	throw new Error(
		"CODEX_CONNECTION_ENCRYPTION_KEY must be 32 bytes encoded as hex or base64",
	);
}

function isCodexCredential(value: unknown): value is Credential {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		record.type === "oauth" &&
		typeof record.access === "string" &&
		typeof record.refresh === "string" &&
		typeof record.expires === "number"
	);
}
