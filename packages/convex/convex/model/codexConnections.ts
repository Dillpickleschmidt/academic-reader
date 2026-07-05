import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { requireServiceSecret } from "./documents";

export interface EncryptedCodexCredential {
	ciphertext: string;
	iv: string;
	tag: string;
}

export async function getCodexConnectionStatus(ctx: QueryCtx) {
	const reader = await requireReader(ctx);
	const connection = await findConnectionByReaderId(ctx, reader._id);

	if (!connection) return { connected: false as const };
	return {
		connected: true as const,
		accountId: connection.accountId,
		connectedAt: connection.connectedAt,
		updatedAt: connection.updatedAt,
	};
}

export async function upsertCodexConnectionForReader(
	ctx: MutationCtx,
	input: {
		accountId?: string;
		encryptedCredential: EncryptedCodexCredential;
	},
) {
	const reader = await requireReader(ctx);
	await upsertConnection(ctx, {
		readerId: reader._id,
		accountId: input.accountId,
		encryptedCredential: input.encryptedCredential,
	});
	return { ok: true as const };
}

export async function disconnectCodexConnection(ctx: MutationCtx) {
	const reader = await requireReader(ctx);
	const connection = await findConnectionByReaderId(ctx, reader._id);
	if (connection) await ctx.db.delete(connection._id);
	return { ok: true as const };
}

export async function getCodexConnectionForReaderFromApi(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		readerId: string;
	},
) {
	requireServiceSecret(input.serviceSecret);
	const connection = await findConnectionByReaderId(ctx, input.readerId);
	if (!connection) return null;
	return {
		readerId: connection.readerId,
		accountId: connection.accountId,
		encryptedCredential: connection.encryptedCredential,
	};
}

export async function upsertCodexConnectionForReaderFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		readerId: string;
		accountId?: string;
		encryptedCredential: EncryptedCodexCredential;
	},
) {
	requireServiceSecret(input.serviceSecret);
	await upsertConnection(ctx, input);
	return { ok: true as const };
}

export async function deleteCodexConnectionForReaderFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		readerId: string;
	},
) {
	requireServiceSecret(input.serviceSecret);
	const connection = await findConnectionByReaderId(ctx, input.readerId);
	if (connection) await ctx.db.delete(connection._id);
	return { ok: true as const };
}

async function upsertConnection(
	ctx: MutationCtx,
	input: {
		readerId: string;
		accountId?: string;
		encryptedCredential: EncryptedCodexCredential;
	},
) {
	const existing = await findConnectionByReaderId(ctx, input.readerId);
	const now = Date.now();

	if (existing) {
		await ctx.db.patch(existing._id, {
			...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
			encryptedCredential: input.encryptedCredential,
			updatedAt: now,
		});
		return existing._id;
	}

	return ctx.db.insert("codexConnections", {
		readerId: input.readerId,
		providerId: "openai-codex",
		...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
		encryptedCredential: input.encryptedCredential,
		connectedAt: now,
		updatedAt: now,
	});
}

function findConnectionByReaderId(
	ctx: QueryCtx | MutationCtx,
	readerId: string,
) {
	return ctx.db
		.query("codexConnections")
		.withIndex("by_reader", (q) => q.eq("readerId", String(readerId)))
		.first();
}
