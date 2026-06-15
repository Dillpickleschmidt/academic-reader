import type {
	NarrationAudioAlignment,
	NarrationWordTimestamp,
} from "@academic-reader/shared/narration";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireServiceSecret } from "./documents";

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

async function requireExistingDocument(
	ctx: MutationCtx,
	documentId: Id<"documents">,
) {
	const document = await ctx.db.get(documentId);
	if (!document) throw new Error("Document not found");
	return document;
}
