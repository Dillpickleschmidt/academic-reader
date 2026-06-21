import type {
	NarrationAudioAlignment,
	NarrationWordTimestamp,
} from "@academic-reader/shared/narration";
import { narrationVoiceById } from "@academic-reader/shared/processing";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { requireServiceSecret } from "./documents";

export async function listNarrationAudioForDocument(
	ctx: QueryCtx,
	input: { documentId: Id<"documents">; voice: string },
) {
	assertValidNarrationVoice(input.voice);
	await requireOwnedDocument(ctx, input.documentId);

	const audio = await ctx.db
		.query("narrationAudio")
		.withIndex("by_document_voice", (q) =>
			q.eq("documentId", input.documentId).eq("voice", input.voice),
		)
		.collect();

	return audio.map((item) => ({
		blockId: item.blockId,
		voice: item.voice,
		durationMs: item.durationMs,
		wordTimestampCount: item.wordTimestamps.length,
		alignment: item.alignment,
	}));
}

export async function getNarrationAudioForPlaybackFromApi(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		blockId: string;
		voice: string;
	},
) {
	requireServiceSecret(input.serviceSecret);
	assertValidNarrationVoice(input.voice);
	await requireOwnedDocument(ctx, input.documentId);

	const audio = await ctx.db
		.query("narrationAudio")
		.withIndex("by_document_block_voice", (q) =>
			q
				.eq("documentId", input.documentId)
				.eq("blockId", input.blockId)
				.eq("voice", input.voice),
		)
		.first();

	if (!audio) throw new Error("Narration audio not found");

	return {
		storageObjectKey: audio.storageObjectKey,
		wordTimestamps: audio.wordTimestamps,
	};
}

export async function upsertNarrationAudioFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		blockId: string;
		voice: string;
		storageObjectKey: string;
		durationMs: number;
		wordTimestamps: NarrationWordTimestamp[];
		alignment: NarrationAudioAlignment;
	},
) {
	requireServiceSecret(input.serviceSecret);
	assertValidNarrationVoice(input.voice);
	await requireExistingDocument(ctx, input.documentId);

	const block = await ctx.db
		.query("blocks")
		.withIndex("by_document_block", (q) =>
			q.eq("documentId", input.documentId).eq("blockId", input.blockId),
		)
		.first();

	if (!block) throw new Error("Block not found");
	if (block.narration?.decision !== "eligible" || !block.narration.text) {
		throw new Error("Narration audio requires persisted Narration Text");
	}

	const existing = await ctx.db
		.query("narrationAudio")
		.withIndex("by_document_block_voice", (q) =>
			q
				.eq("documentId", input.documentId)
				.eq("blockId", input.blockId)
				.eq("voice", input.voice),
		)
		.first();

	if (existing) await ctx.db.delete(existing._id);

	const narrationAudioId = await ctx.db.insert("narrationAudio", {
		documentId: input.documentId,
		blockId: input.blockId,
		voice: input.voice,
		storageObjectKey: input.storageObjectKey,
		durationMs: input.durationMs,
		wordTimestamps: input.wordTimestamps,
		alignment: input.alignment,
	});

	return { narrationAudioId };
}

function assertValidNarrationVoice(voice: string) {
	if (!narrationVoiceById(voice)) {
		throw new Error(`Unknown Narration voice: ${voice}`);
	}
}

async function requireOwnedDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	const reader = await requireReader(ctx);
	const document = await ctx.db.get(documentId);

	if (!document || document.readerId !== reader._id) {
		throw new Error("Document not found");
	}

	return document;
}

async function requireExistingDocument(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
) {
	const document = await ctx.db.get(documentId);
	if (!document) throw new Error("Document not found");
	return document;
}
