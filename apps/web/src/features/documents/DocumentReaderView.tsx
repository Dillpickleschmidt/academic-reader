import type { Doc, Id } from "@academic-reader/convex/data-model";
import type { NarrationWordTimestamp } from "@academic-reader/shared/narration";
import Pause from "lucide-solid/icons/pause";
import Play from "lucide-solid/icons/play";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import X from "lucide-solid/icons/x";
import {
	createEffect,
	createMemo,
	createSignal,
	Index,
	onCleanup,
	Show,
} from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { authClient } from "../../lib/auth-client";
import { fetchJson } from "../../lib/fetch-json";
import { createLatestFetch } from "../../lib/latest-fetch";
import { ReaderDebugOverlayLayer, readerBlockElementId } from "./DocumentDebug";
import {
	extractBlockImageFilenames,
	rewriteBlockImageUrls,
} from "./document-html";
import type { NarrationAudioMetadata } from "./document-narration-audio";
import { EmptyPane, errorMessage } from "./document-page-ui";
import { createStableItems } from "./document-stable-list";
import {
	type EquationExplanationNarrationHighlighterFactory,
	EquationExplanationPanel,
} from "./EquationExplanationPanel";
import {
	createDomNarrationWordHighlighter,
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
	const [playedMs, setPlayedMs] = createSignal(0);
	const [loadedDurationMs, setLoadedDurationMs] = createSignal<number>();
	const totalMs = () => loadedDurationMs() ?? playback()?.audio.durationMs ?? 0;
	let playbackRequestId = 0;
	let activeHighlighter: NarrationWordHighlighter | undefined;
	let highlightFrame: number | undefined;
	const equationExplanationHighlighters = new Map<
		string,
		EquationExplanationNarrationHighlighterFactory
	>();
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
	const imageAccess = createLatestFetch(() => {
		const filenames = imageFilenames();
		if (filenames === undefined || filenames.length === 0) return undefined;
		return { documentId: props.documentId, filenames };
	}, fetchImageAccess);
	const imageUrls = createMemo(() => {
		const filenames = imageFilenames();
		if (filenames === undefined) return undefined;
		if (filenames.length === 0 || imageAccess.error()) return {};
		return imageAccess.data()?.urls;
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
		equationExplanationHighlighters.clear();
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

	function createNarrationWordHighlighterForBlock(
		block: Doc<"blocks">,
		blockElement: HTMLElement,
	) {
		if (blockHasIframeNarration(block)) {
			return equationExplanationHighlighters.get(block.blockId)?.();
		}

		return createDomNarrationWordHighlighter({ blockElement });
	}

	async function playNarrationBlock(
		block: Doc<"blocks">,
		audio: NarrationAudioMetadata,
		playbackTarget?: {
			clientX?: number;
			clientY?: number;
			visibleWordIndex?: number;
		},
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
			? createNarrationWordHighlighterForBlock(block, blockElement)
			: undefined;
		const visibleWordIndex =
			playbackTarget?.visibleWordIndex ??
			(playbackTarget?.clientX !== undefined &&
			playbackTarget.clientY !== undefined
				? highlighter?.visibleWordIndexFromPoint(
						playbackTarget.clientX,
						playbackTarget.clientY,
					)
				: undefined);
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
		setPlayedMs(0);
		setLoadedDurationMs(undefined);
	}

	function togglePlayback() {
		const element = audioElement();
		const state = playback();
		if (!element || !state) return;
		if (state.status === "playing") {
			element.pause();
			return;
		}
		if (state.status === "ended") element.currentTime = 0;
		void element.play();
	}

	function seekToFraction(fraction: number) {
		const element = audioElement();
		const total = totalMs();
		if (!element || !total) return;
		const clamped = Math.min(Math.max(fraction, 0), 1);
		element.currentTime = (clamped * total) / 1000;
		setPlayedMs(clamped * total);
	}

	function handleSeekPointer(event: PointerEvent & { currentTarget: Element }) {
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width === 0) return;
		seekToFraction((event.clientX - rect.left) / rect.width);
	}

	function handleSeekKeyDown(event: KeyboardEvent) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const total = totalMs();
		if (!total) return;
		const step = event.key === "ArrowLeft" ? -5000 : 5000;
		seekToFraction((playedMs() + step) / total);
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
		<div class="reader-view h-full overflow-y-auto bg-background p-6 pb-28 lg:p-10 lg:pb-28">
			<Show when={imageAccess.error()}>
				<p class="mb-4 rounded-sm bg-primary/10 p-3 font-sans text-primary text-sm">
					Some Block images could not be signed for direct storage access.
				</p>
			</Show>
			<Show when={readyBlocks()} fallback={<ReaderSkeleton />}>
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
											role={hasPlayback() ? "button" : undefined}
											tabIndex={hasPlayback() ? 0 : undefined}
											onClick={(event) => void handleBlockClick(event, block())}
											onKeyDown={(event) =>
												void handleBlockKeyDown(event, block())
											}
											onPointerDown={(event) =>
												handlePointerDown(event, block())
											}
										>
											<div innerHTML={blockContentHtml(block())} />
											<Show
												when={
													block().blockType === "equation"
														? block().equationExplanation
														: undefined
												}
											>
												{(explanation) => (
													<EquationExplanationPanel
														contentHtml={explanation().contentHtml}
														onNarrationHighlighterReady={(
															createHighlighter,
														) => {
															if (createHighlighter) {
																equationExplanationHighlighters.set(
																	block().blockId,
																	createHighlighter,
																);
															} else {
																equationExplanationHighlighters.delete(
																	block().blockId,
																);
															}
														}}
														onNarrationRequest={
															hasPlayback()
																? (visibleWordIndex) => {
																		const currentAudio = audio();
																		if (currentAudio) {
																			void playNarrationBlock(
																				block(),
																				currentAudio,
																				{ visibleWordIndex },
																			);
																		}
																	}
																: undefined
														}
													/>
												)}
											</Show>
										</article>
									);
								}}
							</Index>
							<Show when={props.debugEnabled}>
								<ReaderDebugOverlayLayer
									activeDebugBlockId={props.activeDebugBlockId}
									blocks={loadedBlocks()}
									contentContainer={contentContainer()}
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
			<div class={playback() ? "fixed inset-x-4 bottom-4 z-40" : "hidden"}>
				<Show when={playback()}>
					{(state) => (
						<div class="relative mx-auto max-w-3xl rounded-sm border border-border bg-popover font-sans text-popover-foreground shadow-overlay">
							<div
								aria-label="Seek Narration"
								aria-valuemax={Math.round(totalMs())}
								aria-valuemin={0}
								aria-valuenow={Math.round(playedMs())}
								class="group absolute inset-x-0 top-0 h-2 cursor-pointer"
								role="slider"
								tabIndex={0}
								onKeyDown={handleSeekKeyDown}
								onPointerDown={handleSeekPointer}
							>
								<div class="h-0.5 w-full overflow-hidden rounded-t-sm bg-border">
									<div
										class="h-full bg-primary"
										style={{
											width: `${totalMs() ? (playedMs() / totalMs()) * 100 : 0}%`,
										}}
									/>
								</div>
							</div>
							<div class="flex items-center gap-3 px-3 py-2.5 pt-3">
								<button
									aria-label={
										state().status === "playing"
											? "Pause Narration"
											: "Play Narration"
									}
									class={cn(buttonVariants({ size: "icon" }), "rounded-full")}
									disabled={state().status === "loading"}
									type="button"
									onClick={togglePlayback}
								>
									<Show
										when={state().status === "playing"}
										fallback={<Play class="ml-0.5" />}
									>
										<Pause />
									</Show>
								</button>
								<div class="min-w-0 flex-1">
									<div class="truncate font-medium text-sm">
										{state().blockLabel}
									</div>
									<div class="truncate text-muted-foreground text-xs">
										{playbackStatusText(state())}
									</div>
								</div>
								<div class="shrink-0 text-muted-foreground text-xs tabular-nums">
									{formatPlaybackTime(playedMs())} /{" "}
									{formatPlaybackTime(totalMs())}
								</div>
								<Show when={state().status === "error"}>
									<button
										aria-label="Retry Narration"
										class="flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-primary/10"
										type="button"
										onClick={() => void retryPlayback()}
									>
										<RotateCcw class="size-4" />
									</button>
								</Show>
								<button
									aria-label="Close Narration"
									class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
									type="button"
									onClick={stopPlayback}
								>
									<X />
								</button>
							</div>
						</div>
					)}
				</Show>
				<audio
					ref={(element) => setAudioElement(element)}
					class="hidden"
					onDurationChange={(event) => {
						const duration = event.currentTarget.duration;
						if (Number.isFinite(duration)) setLoadedDurationMs(duration * 1000);
					}}
					onEnded={() => updateCurrentPlaybackStatus("ended")}
					onError={() => updateCurrentPlaybackStatus("error")}
					onPause={() => updateCurrentPlaybackStatus("paused")}
					onPlay={() => updateCurrentPlaybackStatus("playing")}
					onTimeUpdate={(event) =>
						setPlayedMs(event.currentTarget.currentTime * 1000)
					}
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

function ReaderSkeleton() {
	return (
		<div class="mx-auto max-w-3xl">
			<Skeleton class="h-7 w-2/3" />
			<div class="mt-8 space-y-3.5">
				<Skeleton class="h-3.5" />
				<Skeleton class="h-3.5" />
				<Skeleton class="h-3.5 w-11/12" />
				<Skeleton class="h-3.5 w-4/5" />
			</div>
			<div class="mt-7 space-y-3.5">
				<Skeleton class="h-3.5" />
				<Skeleton class="h-3.5 w-11/12" />
				<Skeleton class="h-3.5" />
				<Skeleton class="h-3.5 w-3/5" />
			</div>
			<Skeleton class="mt-8 h-56" />
			<div class="mt-8 space-y-3.5">
				<Skeleton class="h-3.5" />
				<Skeleton class="h-3.5 w-5/6" />
				<Skeleton class="h-3.5 w-2/3" />
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

	return fetchJson<ImageAccess>(
		`/api/documents/${encodeURIComponent(input.documentId)}/image-urls`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ filenames: input.filenames }),
		},
		"Could not create Block image URLs",
	);
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
	return fetchJson<{
		url: string;
		wordTimestamps: NarrationWordTimestamp[];
	}>(
		`/api/documents/${encodeURIComponent(input.documentId)}/narration-audio-url?${params}`,
		{ headers: { Authorization: `Bearer ${token}` } },
		"Could not create Narration audio URL",
	);
}

function blockHasIframeNarration(block: Doc<"blocks">) {
	return (
		block.blockType === "equation" && block.equationExplanation !== undefined
	);
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
		sameEquationExplanation(
			previous.equationExplanation,
			next.equationExplanation,
		) &&
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

function sameEquationExplanation(
	previous: Doc<"blocks">["equationExplanation"],
	next: Doc<"blocks">["equationExplanation"],
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	return (
		previous.contentHtml === next.contentHtml &&
		previous.model === next.model &&
		previous.generatedAt === next.generatedAt
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
		"a, button, iframe, input, textarea, select, summary, label, [contenteditable]",
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
	const base = "-mx-3 rounded-sm px-3 py-1 transition-colors";
	if (active) {
		return `${base} bg-primary/10`;
	}
	if (playable) return `${base} cursor-pointer hover:bg-muted/50`;
	return base;
}

function playbackStatusText(state: NarrationPlaybackState) {
	if (state.status === "error") return state.error ?? "Playback failed";
	if (state.status === "loading") return "Loading…";
	if (state.status === "playing") return "Reading";
	if (state.status === "paused") return "Paused";
	return "Finished";
}

function formatPlaybackTime(ms: number) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
