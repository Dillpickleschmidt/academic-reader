import type { Doc, Id } from "@academic-reader/convex/data-model";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";
import { ReaderDebugOverlayLayer, readerBlockElementId } from "./DocumentDebug";
import {
	extractBlockImageFilenames,
	rewriteBlockImageUrls,
} from "./document-html";
import { EmptyPane, PaneSkeleton } from "./document-page-ui";

interface ImageAccess {
	urls: Record<string, string>;
	expiresAt: string;
}

export function ReaderView(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	documentId: Id<"documents">;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const [contentContainer, setContentContainer] =
		createSignal<HTMLDivElement>();
	const imageFilenames = createMemo(() => {
		if (props.blocks === undefined) return undefined;
		return extractBlockImageFilenames(props.blocks, props.documentId);
	});
	const [imageAccess] = createResource(() => {
		const filenames = imageFilenames();
		if (filenames === undefined || filenames.length === 0) return undefined;
		return { documentId: props.documentId, filenames };
	}, fetchImageAccess);
	const imageUrls = createMemo(() => {
		const filenames = imageFilenames();
		if (filenames === undefined) return undefined;
		if (filenames.length === 0 || imageAccess.error) return {};
		return imageAccess()?.urls;
	});
	const renderedBlocks = createMemo(() => {
		const urls = imageUrls();
		if (props.blocks === undefined || urls === undefined) return undefined;

		return props.blocks.map((block) => ({
			...block,
			contentHtml: rewriteBlockImageUrls(
				block.contentHtml,
				props.documentId,
				urls,
			),
		}));
	});

	return (
		<div class="reader-view h-full overflow-y-auto bg-stone-950 p-6 pt-16 lg:p-10">
			<Show when={imageAccess.error}>
				<p class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-sm">
					Some Block images could not be signed for direct storage access.
				</p>
			</Show>
			<Show when={renderedBlocks()} fallback={<PaneSkeleton />}>
				{(loadedBlocks) => (
					<Show
						when={loadedBlocks().length > 0}
						fallback={
							<EmptyPane
								title="No Blocks yet"
								body="Reader View will appear after conversion persists Blocks."
							/>
						}
					>
						<div ref={setContentContainer} class="relative mx-auto max-w-3xl">
							<For each={loadedBlocks()}>
								{(block) => (
									<article
										id={readerBlockElementId(block._id)}
										data-block-id={block.blockId}
										data-block-type={block.blockType}
										data-page-number={block.pageNumber}
										innerHTML={block.contentHtml}
									/>
								)}
							</For>
							<ReaderDebugOverlayLayer
								activeDebugBlockId={props.activeDebugBlockId}
								blocks={loadedBlocks()}
								contentContainer={contentContainer()}
								debugEnabled={props.debugEnabled}
								debugEvents={props.debugEvents}
								document={props.document}
								onHoverDebugBlock={props.onHoverDebugBlock}
								onShowSource={props.onShowSource}
							/>
						</div>
					</Show>
				)}
			</Show>
		</div>
	);
}

async function fetchImageAccess(input: {
	documentId: Id<"documents">;
	filenames: string[];
}) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Block image access");

	const response = await fetch(
		`/api/documents/${encodeURIComponent(input.documentId)}/image-urls`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ filenames: input.filenames }),
		},
	);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || "Could not create Block image URLs");
	}

	return payload as ImageAccess;
}
