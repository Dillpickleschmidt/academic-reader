import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as CodexConnections from "../model/codexConnections";

const encryptedCodexCredentialValidator = v.object({
	ciphertext: v.string(),
	iv: v.string(),
	tag: v.string(),
});

export const getStatus = query({
	args: {},
	handler: (ctx) => CodexConnections.getCodexConnectionStatus(ctx),
});

export const upsertForReader = mutation({
	args: {
		accountId: v.optional(v.string()),
		encryptedCredential: encryptedCodexCredentialValidator,
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) =>
		CodexConnections.upsertCodexConnectionForReader(ctx, args),
});

export const disconnect = mutation({
	args: {},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx) => CodexConnections.disconnectCodexConnection(ctx),
});

export const getForReaderFromApi = query({
	args: {
		serviceSecret: v.string(),
		readerId: v.string(),
	},
	returns: v.union(
		v.null(),
		v.object({
			readerId: v.string(),
			accountId: v.optional(v.string()),
			encryptedCredential: encryptedCodexCredentialValidator,
		}),
	),
	handler: (ctx, args) =>
		CodexConnections.getCodexConnectionForReaderFromApi(ctx, args),
});

export const upsertForReaderFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		readerId: v.string(),
		accountId: v.optional(v.string()),
		encryptedCredential: encryptedCodexCredentialValidator,
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) =>
		CodexConnections.upsertCodexConnectionForReaderFromApi(ctx, args),
});

export const deleteForReaderFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		readerId: v.string(),
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) =>
		CodexConnections.deleteCodexConnectionForReaderFromApi(ctx, args),
});
