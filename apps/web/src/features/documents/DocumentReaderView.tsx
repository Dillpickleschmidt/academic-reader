import type { Doc, Id } from "@academic-reader/convex/data-model";
import type { NarrationWordTimestamp } from "@academic-reader/shared/narration";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Index,
	onCleanup,
	Show,
} from "solid-js";
import { authClient } from "../../lib/auth-client";
import { ReaderDebugOverlayLayer, readerBlockElementId } from "./DocumentDebug";
import {
	extractBlockImageFilenames,
	rewriteBlockImageUrls,
} from "./document-html";
import type { NarrationAudioMetadata } from "./document-narration-audio";
import { EmptyPane, errorMessage, PaneSkeleton } from "./document-page-ui";
import { createStableItems } from "./document-stable-list";
import {
	createNarrationWordHighlighter,
	type NarrationWordHighlighter,
} from "./narration-word-highlighting";

interface ImageAccess {
	urls: Record<string, string>;
	expiresAt: string;
}

interface NarrationPlaybackState {
	requestId: number;
	blockId: string;
	blockLabel: string;
	audio: NarrationAudioMetadata;
	captionText: string | undefined;
	hasWordTiming: boolean;
	status: "loading" | "playing" | "paused" | "ended" | "error";
	url?: string;
	seekMs?: number;
	error?: string;
}

export function ReaderView(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	documentId: Id<"documents">;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const [contentContainer, setContentContainer] =
		createSignal<HTMLDivElement>();
	const [audioElement, setAudioElement] = createSignal<HTMLAudioElement>();
	const [playback, setPlayback] = createSignal<NarrationPlaybackState>();
	let playbackRequestId = 0;
	let activeHighlighter: NarrationWordHighlighter | undefined;
	let highlightFrame: number | undefined;
	let pointerDown:
		| { blockId: string; clientX: number; clientY: number }
		| undefined;
	const imageFilenames = createMemo(
		() => {
			if (props.blocks === undefined) return undefined;
			return extractBlockImageFilenames(props.blocks, props.documentId);
		},
		undefined,
		{ equals: sameStringArray },
	);
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
	const readyBlocks = createStableItems(
		() => {
			const urls = imageUrls();
			if (props.blocks === undefined || urls === undefined) return undefined;
			return props.blocks;
		},
		(block) => block._id,
		sameBlockDocument,
	);
	const narrationAudioByBlockId = createMemo(
		() =>
			new Map((props.narrationAudio ?? []).map((item) => [item.blockId, item])),
	);

	createEffect(() => {
		const state = playback();
		const element = audioElement();
		if (!state?.url || state.status !== "loading" || !element) return;

		void loadAndPlayNarration(state, element);
	});

	onCleanup(() => {
		playbackRequestId += 1;
		restoreActiveHighlighter();
		const element = audioElement();
		if (!element) return;
		element.pause();
		element.removeAttribute("src");
		element.load();
	});

	function narrationEnabled() {
		return props.document?.processingConfiguration.narration.enabled === true;
	}

	function blockContentHtml(block: Doc<"blocks">) {
		return rewriteBlockImageUrls(
			block.contentHtml,
			props.documentId,
			imageUrls() ?? {},
		);
	}

	function handlePointerDown(event: PointerEvent, block: Doc<"blocks">) {
		if (event.button !== 0) return;
		pointerDown = {
			blockId: block.blockId,
			clientX: event.clientX,
			clientY: event.clientY,
		};
	}

	async function handleBlockClick(event: MouseEvent, block: Doc<"blocks">) {
		const audio = narrationAudioByBlockId().get(block.blockId);
		if (
			!audio ||
			props.debugEnabled ||
			shouldIgnoreBlockClick(event, pointerDown)
		) {
			return;
		}

		await playNarrationBlock(block, audio, {
			clientX: event.clientX,
			clientY: event.clientY,
		});
	}

	async function handleBlockKeyDown(
		event: KeyboardEvent,
		block: Doc<"blocks">,
	) {
		if (event.key !== "Enter" && event.key !== " ") return;
		const audio = narrationAudioByBlockId().get(block.blockId);
		const target = event.target;
		if (
			!audio ||
			props.debugEnabled ||
			(target instanceof Element && isInteractiveElement(target))
		) {
			return;
		}

		event.preventDefault();
		await playNarrationBlock(block, audio);
	}

	async function playNarrationBlock(
		block: Doc<"blocks">,
		audio: NarrationAudioMetadata,
		clickPoint?: { clientX: number; clientY: number },
	) {
		const voice = props.document?.processingConfiguration.narration.voice;
		if (!voice) return;

		const requestId = playbackRequestId + 1;
		playbackRequestId = requestId;
		audioElement()?.pause();
		restoreActiveHighlighter();

		const blockElement = document.getElementById(
			readerBlockElementId(block._id),
		);
		const highlighter = blockElement
			? createNarrationWordHighlighter({ blockElement })
			: undefined;
		const visibleWordIndex = clickPoint
			? highlighter?.visibleWordIndexFromPoint(
					clickPoint.clientX,
					clickPoint.clientY,
				)
			: undefined;
		activeHighlighter = highlighter;

		setPlayback({
			requestId,
			blockId: block.blockId,
			blockLabel: `Block #${block.order + 1}`,
			audio,
			captionText:
				block.narration?.decision === "eligible"
					? block.narration.text
					: undefined,
			hasWordTiming: false,
			status: "loading",
		});

		try {
			const access = await fetchNarrationAudioAccess({
				documentId: props.documentId,
				blockId: block.blockId,
				voice,
			});
			if (playbackRequestId !== requestId) {
				highlighter?.restore();
				return;
			}

			let seekMs: number | undefined;
			if (highlighter && access.wordTimestamps.length) {
				highlighter.setWordTimestamps(access.wordTimestamps);
				if (visibleWordIndex !== undefined) {
					seekMs = highlighter.seekMsForVisibleWord(visibleWordIndex);
				}
			} else {
				highlighter?.restore();
				if (activeHighlighter === highlighter) activeHighlighter = undefined;
			}

			updatePlayback(requestId, {
				url: access.url,
				hasWordTiming: access.wordTimestamps.length > 0,
				seekMs,
				status: "loading",
				error: undefined,
			});
		} catch (fetchError) {
			highlighter?.restore();
			if (activeHighlighter === highlighter) activeHighlighter = undefined;
			updatePlayback(requestId, {
				status: "error",
				error: errorMessage(fetchError),
			});
		}
	}

	async function retryPlayback() {
		const state = playback();
		if (!state) return;

		const block = readyBlocks()?.find((item) => item.blockId === state.blockId);
		if (!block) return;
		await playNarrationBlock(block, state.audio);
	}

	function stopPlayback() {
		playbackRequestId += 1;
		restoreActiveHighlighter();
		const element = audioElement();
		if (element) {
			element.pause();
			element.removeAttribute("src");
			element.load();
		}
		setPlayback(undefined);
	}

	async function loadAndPlayNarration(
		state: NarrationPlaybackState,
		element: HTMLAudioElement,
	) {
		element.src = state.url ?? "";
		element.load();
		try {
			if (state.seekMs !== undefined) {
				await waitForAudioMetadata(element);
				if (playback()?.requestId !== state.requestId) return;
				element.currentTime = state.seekMs / 1000;
			}
			if (playback()?.requestId !== state.requestId) return;
			await element.play();
			if (playback()?.requestId !== state.requestId) return;
			updatePlayback(state.requestId, { status: "playing" });
		} catch (playError) {
			if (playback()?.requestId !== state.requestId) return;
			restoreActiveHighlighter();
			updatePlayback(state.requestId, {
				status: "error",
				error: errorMessage(playError),
			});
		}
	}

	function startHighlightLoop(requestId: number) {
		stopHighlightLoop();
		const animate = () => {
			if (playback()?.requestId !== requestId) return;
			const element = audioElement();
			if (element) activeHighlighter?.highlightAtMs(element.currentTime * 1000);
			highlightFrame = requestAnimationFrame(animate);
		};
		highlightFrame = requestAnimationFrame(animate);
	}

	function stopHighlightLoop() {
		if (highlightFrame !== undefined) cancelAnimationFrame(highlightFrame);
		highlightFrame = undefined;
	}

	function restoreActiveHighlighter() {
		stopHighlightLoop();
		activeHighlighter?.restore();
		activeHighlighter = undefined;
	}

	function updatePlayback(
		requestId: number,
		patch: Partial<NarrationPlaybackState>,
	) {
		setPlayback((current) =>
			current?.requestId === requestId ? { ...current, ...patch } : current,
		);
	}

	function updateCurrentPlaybackStatus(
		status: NarrationPlaybackState["status"],
	) {
		const state = playback();
		if (status === "playing" && state?.hasWordTiming) {
			startHighlightLoop(state.requestId);
		}
		if (status === "paused") stopHighlightLoop();
		if (status === "ended" || status === "error") restoreActiveHighlighter();
		setPlayback((current) => (current ? { ...current, status } : current));
	}

	return (
		<div class="reader-view h-full overflow-y-auto bg-stone-950 p-6 pt-16 lg:p-10">
			<Show when={imageAccess.error}>
				<p class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-sm">
					Some Block images could not be signed for direct storage access.
				</p>
			</Show>
			<Show when={readyBlocks()} fallback={<PaneSkeleton />}>
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
							<Index each={loadedBlocks()}>
								{(block) => {
									const audio = createMemo(
										() => narrationAudioByBlockId().get(block().blockId),
										undefined,
										{ equals: sameNarrationAudioMetadata },
									);
									const hasPlayback = () =>
										!!audio() && narrationEnabled() && !props.debugEnabled;

									return (
										<article
											id={readerBlockElementId(block()._id)}
											aria-label={
												hasPlayback()
													? `Play Narration for Block #${block().order + 1}`
													: undefined
											}
											class={readerArticleClass(
												hasPlayback(),
												playback()?.blockId === block().blockId,
											)}
											data-block-id={block().blockId}
											data-block-type={block().blockType}
											data-page-number={block().pageNumber}
											innerHTML={blockContentHtml(block())}
											role={hasPlayback() ? "button" : undefined}
											tabIndex={hasPlayback() ? 0 : undefined}
											onClick={(event) => void handleBlockClick(event, block())}
											onKeyDown={(event) =>
												void handleBlockKeyDown(event, block())
											}
											onPointerDown={(event) =>
												handlePointerDown(event, block())
											}
										/>
									);
								}}
							</Index>
							<Show when={props.debugEnabled}>
								<ReaderDebugOverlayLayer
									activeDebugBlockId={props.activeDebugBlockId}
									blocks={loadedBlocks()}
									contentContainer={contentContainer()}
									debugEnabled={props.debugEnabled}
									debugEvents={props.debugEvents}
									document={props.document}
									narrationAudio={props.narrationAudio}
									onHoverDebugBlock={props.onHoverDebugBlock}
									onShowSource={props.onShowSource}
								/>
							</Show>
						</div>
					</Show>
				)}
			</Show>
			<div
				class={
					playback()
						? "fixed inset-x-4 bottom-20 z-40 mx-auto max-w-3xl rounded-2xl border border-stone-700 bg-stone-950/95 p-3 shadow-2xl shadow-black/60 backdrop-blur"
						: "hidden"
				}
			>
				<Show when={playback()}>
					{(state) => (
						<div class="mb-2 flex items-start justify-between gap-3">
							<div>
								<div class="font-medium text-sm text-stone-100">
									Narration · {state().blockLabel}
								</div>
								<div class="text-stone-400 text-xs">
									{playbackStatusText(state())}
								</div>
							</div>
							<div class="flex gap-2">
								<Show when={state().status === "error"}>
									<button
										class="rounded-full border border-amber-300/50 px-3 py-1 text-amber-100 text-xs hover:bg-amber-300/10"
										type="button"
										onClick={() => void retryPlayback()}
									>
										Retry
									</button>
								</Show>
								<button
									class="rounded-full border border-stone-700 px-3 py-1 text-stone-300 text-xs hover:bg-stone-900"
									type="button"
									onClick={stopPlayback}
								>
									Close
								</button>
							</div>
						</div>
					)}
				</Show>
				<audio
					ref={(element) => setAudioElement(element)}
					class="w-full"
					controls
					onEnded={() => updateCurrentPlaybackStatus("ended")}
					onError={() => updateCurrentPlaybackStatus("error")}
					onPause={() => updateCurrentPlaybackStatus("paused")}
					onPlay={() => updateCurrentPlaybackStatus("playing")}
				>
					<track
						default
						kind="captions"
						label="Narration Text"
						src={captionTrackUrl(playback())}
					/>
				</audio>
			</div>
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

async function fetchNarrationAudioAccess(input: {
	documentId: Id<"documents">;
	blockId: string;
	voice: string;
}) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Narration audio access");

	const params = new URLSearchParams({
		blockId: input.blockId,
		voice: input.voice,
	});
	const response = await fetch(
		`/api/documents/${encodeURIComponent(input.documentId)}/narration-audio-url?${params}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || "Could not create Narration audio URL");
	}

	return payload as {
		url: string;
		wordTimestamps: NarrationWordTimestamp[];
	};
}

function sameBlockDocument(previous: Doc<"blocks">, next: Doc<"blocks">) {
	return (
		previous._id === next._id &&
		previous._creationTime === next._creationTime &&
		previous.documentId === next.documentId &&
		previous.blockId === next.blockId &&
		previous.blockType === next.blockType &&
		previous.rawBlockType === next.rawBlockType &&
		previous.order === next.order &&
		previous.contentHtml === next.contentHtml &&
		previous.contentMarkdown === next.contentMarkdown &&
		previous.pageNumber === next.pageNumber &&
		sameSourceGeometry(
			previous.normalizedBoundingBox,
			next.normalizedBoundingBox,
		) &&
		sameBlockNarration(previous.narration, next.narration)
	);
}

function sameSourceGeometry(
	previous: Doc<"blocks">["normalizedBoundingBox"],
	next: Doc<"blocks">["normalizedBoundingBox"],
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	return (
		previous.left === next.left &&
		previous.top === next.top &&
		previous.width === next.width &&
		previous.height === next.height
	);
}

function sameBlockNarration(
	previous: Doc<"blocks">["narration"],
	next: Doc<"blocks">["narration"],
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	if (previous.decision === "ineligible") {
		return next.decision === "ineligible" && previous.reason === next.reason;
	}
	if (next.decision !== "eligible") return false;
	return (
		previous.text === next.text &&
		previous.preparation.length === next.preparation.length &&
		previous.preparation.every(
			(value, index) => value === next.preparation[index],
		)
	);
}

function sameNarrationAudioMetadata(
	previous: NarrationAudioMetadata | undefined,
	next: NarrationAudioMetadata | undefined,
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	return (
		previous.blockId === next.blockId &&
		previous.voice === next.voice &&
		previous.durationMs === next.durationMs &&
		previous.wordTimestampCount === next.wordTimestampCount &&
		previous.alignment.status === next.alignment.status &&
		previous.alignment.source === next.alignment.source &&
		previous.alignment.error === next.alignment.error
	);
}

function sameStringArray(
	previous: string[] | undefined,
	next: string[] | undefined,
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	if (previous.length !== next.length) return false;
	return previous.every((value, index) => value === next[index]);
}

function waitForAudioMetadata(element: HTMLAudioElement) {
	if (element.readyState >= 1) return Promise.resolve();

	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			element.removeEventListener("loadedmetadata", handleLoaded);
			element.removeEventListener("error", handleError);
		};
		const handleLoaded = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error("Could not load Narration audio metadata"));
		};

		element.addEventListener("loadedmetadata", handleLoaded, { once: true });
		element.addEventListener("error", handleError, { once: true });
	});
}

function shouldIgnoreBlockClick(
	event: MouseEvent,
	pointerDown:
		| { blockId: string; clientX: number; clientY: number }
		| undefined,
) {
	const target = event.target;
	if (target instanceof Element && isInteractiveElement(target)) return true;
	if (window.getSelection()?.toString().trim()) return true;
	if (!pointerDown) return false;

	const blockId =
		event.currentTarget instanceof HTMLElement
			? event.currentTarget.dataset.blockId
			: undefined;
	if (blockId && blockId !== pointerDown.blockId) return true;

	return (
		Math.hypot(
			event.clientX - pointerDown.clientX,
			event.clientY - pointerDown.clientY,
		) > 6
	);
}

function isInteractiveElement(element: Element) {
	return !!element.closest(
		"a, button, input, textarea, select, summary, label, [contenteditable]",
	);
}

function captionTrackUrl(state: NarrationPlaybackState | undefined) {
	if (!state?.captionText) return undefined;

	const vtt = `WEBVTT\n\n00:00.000 --> ${vttTimestamp(state.audio.durationMs)}\n${state.captionText}\n`;
	return `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`;
}

function vttTimestamp(durationMs: number) {
	const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000`;
}

function readerArticleClass(playable: boolean, active: boolean) {
	const base = "-mx-3 rounded-xl px-3 py-1 transition-colors";
	if (active) {
		return `${base} bg-amber-300/10 ring-1 ring-amber-300/40`;
	}
	if (playable) return `${base} cursor-pointer hover:bg-stone-900/70`;
	return base;
}

function playbackStatusText(state: NarrationPlaybackState) {
	if (state.status === "error") return state.error ?? "Playback failed";
	return `${state.status} · ${Math.round(state.audio.durationMs / 100) / 10}s`;
}
