import type { NarrationWordTimestamp } from "@academic-reader/shared/narration";

interface NarrationHighlightRange {
	start: number;
	end: number;
}

export interface NarrationWordHighlighter {
	visibleWordIndexFromPoint: (
		clientX: number,
		clientY: number,
	) => number | undefined;
	seekMsForVisibleWord: (visibleWordIndex: number) => number | undefined;
	setWordTimestamps: (wordTimestamps: NarrationWordTimestamp[]) => void;
	highlightAtMs: (currentMs: number) => void;
	restore: () => void;
}

const narrationWordIndexAttribute = "data-narration-word-index";
const narrationWordClass = "narration-word";
const activeNarrationWordClass = "narration-word-active";
const nearbyThreshold = 3;
const sequenceLength = 3;

export function createNarrationWordHighlighter(input: {
	blockElement: HTMLElement;
}): NarrationWordHighlighter {
	const originalHtml = input.blockElement.innerHTML;
	let restored = false;
	let currentRange: NarrationHighlightRange | null = null;
	let wordTimestamps: NarrationWordTimestamp[] = [];

	if (!input.blockElement.querySelector(`[${narrationWordIndexAttribute}]`)) {
		wrapNarrationWords(input.blockElement);
	}

	const spans = Array.from(
		input.blockElement.querySelectorAll<HTMLElement>(
			`[${narrationWordIndexAttribute}]`,
		),
	);
	const visibleWords = spans.map((span) => span.textContent ?? "");
	let ranges: Array<NarrationHighlightRange | null> = [];

	function setWordTimestamps(nextWordTimestamps: NarrationWordTimestamp[]) {
		wordTimestamps = nextWordTimestamps;
		ranges = buildNarrationHighlightRanges(
			visibleWords,
			wordTimestamps.map((timestamp) => timestamp.word),
		);
		clearHighlight();
	}

	function visibleWordIndexFromElement(element: Element | null) {
		const wordElement = element?.closest(`[${narrationWordIndexAttribute}]`);
		return wordElement ? wordIndex(wordElement) : undefined;
	}

	function visibleWordIndexFromPoint(clientX: number, clientY: number) {
		return visibleWordIndexFromElement(
			document.elementFromPoint(clientX, clientY),
		);
	}

	function highlightAtMs(currentMs: number) {
		const spokenIndex = activeSpokenWordIndex(wordTimestamps, currentMs);
		if (spokenIndex === undefined) return;

		const range = ranges[spokenIndex] ?? null;
		if (rangesEqual(range, currentRange)) return;

		removeActiveClass(currentRange, spans);
		addActiveClass(range, spans);
		currentRange = range;
	}

	function clearHighlight() {
		removeActiveClass(currentRange, spans);
		currentRange = null;
	}

	function restore() {
		if (restored) return;
		restored = true;
		input.blockElement.innerHTML = originalHtml;
	}

	return {
		visibleWordIndexFromPoint,
		seekMsForVisibleWord: (visibleWordIndex) =>
			seekMsForVisibleWord({
				visibleWordIndex,
				ranges,
				wordTimestamps,
			}),
		setWordTimestamps,
		highlightAtMs,
		restore,
	};
}

export function buildNarrationHighlightRanges(
	visibleWords: string[],
	spokenWords: string[],
): Array<NarrationHighlightRange | null> {
	const normalizedVisibleWords = visibleWords.map(normalizeWord);
	const normalizedSpokenWords = spokenWords.map(normalizeWord);
	const mapping = alignWordIndices(
		normalizedSpokenWords,
		normalizedVisibleWords,
	);
	const gapRanges = detectGapRanges(mapping);
	const ranges: Array<NarrationHighlightRange | null> = new Array(
		spokenWords.length,
	).fill(null);

	for (const [spokenIndex, visibleIndex] of mapping) {
		ranges[spokenIndex] = { start: visibleIndex, end: visibleIndex };
	}

	for (const gap of gapRanges) {
		for (let i = gap.spokenStart; i <= gap.spokenEnd; i += 1) {
			ranges[i] = { start: gap.visibleStart, end: gap.visibleEnd };
		}
	}

	return ranges;
}

export function seekMsForVisibleWord(input: {
	visibleWordIndex: number;
	ranges: Array<NarrationHighlightRange | null>;
	wordTimestamps: NarrationWordTimestamp[];
}) {
	const directSpokenIndex = input.ranges.findIndex(
		(range, spokenIndex) =>
			!!input.wordTimestamps[spokenIndex] &&
			range !== null &&
			input.visibleWordIndex >= range.start &&
			input.visibleWordIndex <= range.end,
	);
	if (directSpokenIndex >= 0) {
		return input.wordTimestamps[directSpokenIndex]?.startMs;
	}

	let nearest:
		| {
				spokenIndex: number;
				distance: number;
		  }
		| undefined;
	for (
		let spokenIndex = 0;
		spokenIndex < input.ranges.length;
		spokenIndex += 1
	) {
		const range = input.ranges[spokenIndex];
		if (!range || !input.wordTimestamps[spokenIndex]) continue;

		const distance = distanceToRange(input.visibleWordIndex, range);
		if (!nearest || distance < nearest.distance) {
			nearest = { spokenIndex, distance };
		}
	}

	return nearest !== undefined
		? input.wordTimestamps[nearest.spokenIndex]?.startMs
		: undefined;
}

function wrapNarrationWords(element: Element) {
	let wordIndex = 0;

	function processNode(node: Node) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const currentElement = node as Element;
			if (currentElement.classList.contains("katex")) {
				currentElement.setAttribute(
					narrationWordIndexAttribute,
					String(wordIndex++),
				);
				currentElement.classList.add(narrationWordClass);
				return;
			}
			for (const child of Array.from(node.childNodes)) {
				processNode(child);
			}
			return;
		}

		if (node.nodeType !== Node.TEXT_NODE) return;

		const text = node.textContent ?? "";
		if (!text.trim()) return;

		const fragment = document.createDocumentFragment();
		for (const part of text.split(/(\s+)/)) {
			if (/^\s+$/.test(part)) {
				fragment.appendChild(document.createTextNode(part));
			} else if (part) {
				const span = document.createElement("span");
				span.setAttribute(narrationWordIndexAttribute, String(wordIndex++));
				span.className = narrationWordClass;
				span.textContent = part;
				fragment.appendChild(span);
			}
		}
		node.parentNode?.replaceChild(fragment, node);
	}

	processNode(element);
}

function alignWordIndices(
	spokenWords: string[],
	visibleWords: string[],
): Map<number, number> {
	const mapping = new Map<number, number>();
	const used = new Set<number>();
	let cursor = 0;

	for (
		let spokenIndex = 0;
		spokenIndex < spokenWords.length;
		spokenIndex += 1
	) {
		const word = spokenWords[spokenIndex];
		if (!word) continue;

		let match = -1;
		for (
			let visibleIndex = cursor;
			visibleIndex < visibleWords.length;
			visibleIndex += 1
		) {
			if (used.has(visibleIndex) || word !== visibleWords[visibleIndex])
				continue;

			if (visibleIndex - cursor < nearbyThreshold) {
				match = visibleIndex;
				break;
			}

			if (
				matchesSequence(
					spokenWords,
					spokenIndex,
					visibleWords,
					visibleIndex,
					used,
					sequenceLength,
				)
			) {
				match = visibleIndex;
				break;
			}
		}

		if (match >= 0) {
			mapping.set(spokenIndex, match);
			used.add(match);
			cursor = match + 1;
		}
	}

	return mapping;
}

function detectGapRanges(mapping: Map<number, number>) {
	const ranges: Array<{
		spokenStart: number;
		spokenEnd: number;
		visibleStart: number;
		visibleEnd: number;
	}> = [];
	const entries = Array.from(mapping.entries()).sort((a, b) => a[0] - b[0]);

	for (let i = 0; i < entries.length - 1; i += 1) {
		const [spokenIndex, visibleIndex] = entries[i];
		const [nextSpokenIndex, nextVisibleIndex] = entries[i + 1];
		const spokenStart = spokenIndex + 1;
		const spokenEnd = nextSpokenIndex - 1;
		const visibleStart = visibleIndex + 1;
		const visibleEnd = nextVisibleIndex - 1;

		if (spokenEnd >= spokenStart && visibleEnd >= visibleStart) {
			ranges.push({ spokenStart, spokenEnd, visibleStart, visibleEnd });
		}
	}

	return ranges;
}

function normalizeWord(word: string) {
	return word.toLowerCase().replace(/[^a-z']/g, "");
}

function matchesSequence(
	spokenWords: string[],
	spokenIndex: number,
	visibleWords: string[],
	visibleIndex: number,
	used: Set<number>,
	length: number,
) {
	for (let i = 0; i < length; i += 1) {
		if (
			spokenIndex + i >= spokenWords.length ||
			visibleIndex + i >= visibleWords.length
		) {
			return false;
		}
		if (
			used.has(visibleIndex + i) ||
			spokenWords[spokenIndex + i] !== visibleWords[visibleIndex + i]
		) {
			return false;
		}
	}
	return true;
}

function activeSpokenWordIndex(
	wordTimestamps: NarrationWordTimestamp[],
	currentMs: number,
) {
	for (let i = 0; i < wordTimestamps.length; i += 1) {
		const timestamp = wordTimestamps[i];
		if (timestamp.startMs > currentMs) break;
		if (currentMs >= timestamp.startMs && currentMs < timestamp.endMs) {
			return i;
		}
	}
	return undefined;
}

function wordIndex(element: Element) {
	const value = element.getAttribute(narrationWordIndexAttribute);
	if (!value) return undefined;
	const index = Number.parseInt(value, 10);
	return Number.isNaN(index) ? undefined : index;
}

function distanceToRange(index: number, range: NarrationHighlightRange) {
	if (index < range.start) return range.start - index;
	if (index > range.end) return index - range.end;
	return 0;
}

function removeActiveClass(
	range: NarrationHighlightRange | null,
	spans: HTMLElement[],
) {
	if (!range) return;
	for (let i = range.start; i <= range.end; i += 1) {
		spans[i]?.classList.remove(activeNarrationWordClass);
	}
}

function addActiveClass(
	range: NarrationHighlightRange | null,
	spans: HTMLElement[],
) {
	if (!range) return;
	for (let i = range.start; i <= range.end; i += 1) {
		spans[i]?.classList.add(activeNarrationWordClass);
	}
}

function rangesEqual(
	a: NarrationHighlightRange | null,
	b: NarrationHighlightRange | null,
) {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	return a.start === b.start && a.end === b.end;
}
