import {
	type BlockNarration,
	narrationPreparations,
} from "@academic-reader/shared/narration";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { requireServiceSecret } from "./documents";

export async function listBlocksForDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	await requireOwnedDocument(ctx, documentId);

	return ctx.db
		.query("blocks")
		.withIndex("by_document_order", (q) => q.eq("documentId", documentId))
		.order("asc")
		.collect();
}

export async function listBlocksForDocumentFromApi(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
	},
) {
	requireServiceSecret(input.serviceSecret);
	await requireExistingDocument(ctx, input.documentId);

	return ctx.db
		.query("blocks")
		.withIndex("by_document_order", (q) => q.eq("documentId", input.documentId))
		.order("asc")
		.collect();
}

export async function patchBlockNarrationsFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		narrations: Array<{
			blockId: string;
			narration: BlockNarration;
		}>;
	},
) {
	requireServiceSecret(input.serviceSecret);
	await requireExistingDocument(ctx, input.documentId);

	let patchedCount = 0;
	const missingBlockIds: string[] = [];

	for (const narration of input.narrations) {
		const block = await ctx.db
			.query("blocks")
			.withIndex("by_document_block", (q) =>
				q.eq("documentId", input.documentId).eq("blockId", narration.blockId),
			)
			.first();

		if (!block) {
			missingBlockIds.push(narration.blockId);
			continue;
		}

		assertValidBlockNarration(narration.narration);
		await ctx.db.patch(block._id, { narration: narration.narration });
		patchedCount += 1;
	}

	return { patchedCount, missingBlockIds };
}

export async function patchBlockNarrationTextsFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		texts: Array<{
			blockId: string;
			text: string;
		}>;
	},
) {
	requireServiceSecret(input.serviceSecret);
	await requireExistingDocument(ctx, input.documentId);

	let patchedCount = 0;
	const patchedBlockIds: string[] = [];
	const missingBlockIds: string[] = [];
	const ineligibleBlockIds: string[] = [];

	for (const item of input.texts) {
		const text = item.text.trim();
		if (!text) throw new Error("Narration Text cannot be empty");

		const block = await ctx.db
			.query("blocks")
			.withIndex("by_document_block", (q) =>
				q.eq("documentId", input.documentId).eq("blockId", item.blockId),
			)
			.first();

		if (!block) {
			missingBlockIds.push(item.blockId);
			continue;
		}
		if (block.narration?.decision !== "eligible") {
			ineligibleBlockIds.push(item.blockId);
			continue;
		}

		await ctx.db.patch(block._id, {
			narration: { ...block.narration, text },
		});
		patchedCount += 1;
		patchedBlockIds.push(item.blockId);
	}

	return { patchedCount, patchedBlockIds, missingBlockIds, ineligibleBlockIds };
}

const narrationPreparationSet = new Set<string>(narrationPreparations);

function assertValidBlockNarration(narration: BlockNarration) {
	if (narration.decision === "ineligible") return;
	if (!narration.preparation.length) {
		throw new Error("Eligible Block Narration requires preparation");
	}
	for (const preparation of narration.preparation) {
		if (!narrationPreparationSet.has(preparation)) {
			throw new Error(`Invalid Narration Preparation: ${preparation}`);
		}
	}
	if (new Set(narration.preparation).size !== narration.preparation.length) {
		throw new Error("Narration Preparation tags must be unique");
	}
	if (
		narration.preparation.includes("plain") &&
		narration.preparation.length > 1
	) {
		throw new Error("plain Narration Preparation cannot be combined");
	}
}

async function requireOwnedDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	const reader = await requireReader(ctx);
	const document = await ctx.db.get("documents", documentId);

	if (!document || document.readerId !== reader._id) {
		throw new Error("Document not found");
	}

	return document;
}

async function requireExistingDocument(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
) {
	const document = await ctx.db.get("documents", documentId);
	if (!document) {
		throw new Error("Document not found");
	}
	return document;
}
