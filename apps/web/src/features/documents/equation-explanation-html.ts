import katex from "katex";
import katexCss from "katex/dist/katex.min.css?inline";
import type { NarrationHighlightRange } from "./narration-word-highlighting";

export const equationExplanationMessageTypes = {
	height: "academic-reader.equation-explanation.height",
	narrationReady: "academic-reader.equation-explanation.narration-ready",
	narrationRequest: "academic-reader.equation-explanation.narration-request",
	narrationHighlight:
		"academic-reader.equation-explanation.narration-highlight",
} as const;

export interface EquationExplanationNarrationReadyMessage {
	type: typeof equationExplanationMessageTypes.narrationReady;
	visibleWords: string[];
}

export interface EquationExplanationNarrationRequestMessage {
	type: typeof equationExplanationMessageTypes.narrationRequest;
	visibleWordIndex?: number;
}

export interface EquationExplanationNarrationHighlightMessage {
	type: typeof equationExplanationMessageTypes.narrationHighlight;
	range: NarrationHighlightRange | null;
}

export function equationExplanationSrcdoc(contentHtml: string) {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${katexCss}
${equationExplanationThemeCss()}
* { box-sizing: border-box; }
html { color-scheme: var(--academic-reader-color-scheme); }
body {
	margin: 0;
	background: var(--background);
	color: var(--foreground);
	font-family: "Literata Variable", Charter, Georgia, serif;
	font-size: 1.0625rem;
	line-height: 1.7;
}
:is(h1, h2, h3, h4, h5, h6) {
	font-family: "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif;
	line-height: 1.25;
	margin: 1rem 0 0.5rem;
}
p, ul, ol, blockquote, table, pre { margin: 0.85rem 0; }
ul, ol { padding-left: 1.5rem; }
blockquote { border-left: 2px solid var(--border); color: var(--muted-foreground); margin-left: 0; padding-left: 1rem; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
pre { overflow-x: auto; border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.75rem; }
table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-family: "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif; font-size: 0.875rem; }
th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; }
a { color: var(--primary); }
.narration-word { border-radius: 0.25rem; box-decoration-break: clone; }
.narration-word-active { background: color-mix(in oklab, var(--primary) 28%, transparent); }
</style>
</head>
<body>
${renderEquationExplanationMathHtml(contentHtml)}
<script>
(() => {
	const messageTypes = ${JSON.stringify(equationExplanationMessageTypes)};
	const wordIndexAttribute = "data-narration-word-index";
	const wordClass = "narration-word";
	const activeWordClass = "narration-word-active";
	const skippedElementNames = new Set([
		"A",
		"BUTTON",
		"INPUT",
		"LABEL",
		"NOSCRIPT",
		"OPTION",
		"SCRIPT",
		"SELECT",
		"STYLE",
		"SUMMARY",
		"TEMPLATE",
		"TEXTAREA"
	]);
	let spans = [];
	let currentRange = null;

	const postHeight = () => {
		const height = Math.max(
			document.documentElement.scrollHeight,
			document.body ? document.body.scrollHeight : 0
		);
		parent.postMessage({ type: messageTypes.height, height }, "*");
	};
	const isInteractiveElement = (target) => {
		return target instanceof Element && target.closest(
			"a, button, input, textarea, select, summary, label, [contenteditable]"
		);
	};
	const wordIndexFromTarget = (target) => {
		if (!(target instanceof Element)) return undefined;
		const word = target.closest("[" + wordIndexAttribute + "]");
		if (!word) return undefined;
		const value = word.getAttribute(wordIndexAttribute);
		if (!value) return undefined;
		const index = Number.parseInt(value, 10);
		return Number.isNaN(index) ? undefined : index;
	};
	const visibleWords = () => spans.map((span) => span.textContent || "");
	const postNarrationReady = () => {
		parent.postMessage(
			{ type: messageTypes.narrationReady, visibleWords: visibleWords() },
			"*"
		);
	};
	const clearHighlight = () => {
		if (!currentRange) return;
		for (let index = currentRange.start; index <= currentRange.end; index += 1) {
			spans[index]?.classList.remove(activeWordClass);
		}
		currentRange = null;
	};
	const setHighlightRange = (range) => {
		clearHighlight();
		if (!range) return;
		currentRange = range;
		for (let index = range.start; index <= range.end; index += 1) {
			spans[index]?.classList.add(activeWordClass);
		}
	};
	const validRange = (value) => {
		if (value === null) return null;
		if (
			typeof value !== "object" ||
			!Number.isInteger(value.start) ||
			!Number.isInteger(value.end) ||
			value.start < 0 ||
			value.end < value.start
		) {
			return undefined;
		}
		return { start: value.start, end: value.end };
	};
	const wrapNarrationWords = () => {
		let wordIndex = 0;
		const processNode = (node) => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node;
				if (skippedElementNames.has(element.tagName) || element.hasAttribute("contenteditable")) return;
				if (element.classList.contains("katex")) {
					element.setAttribute(wordIndexAttribute, String(wordIndex++));
					element.classList.add(wordClass);
					return;
				}
				for (const child of Array.from(node.childNodes)) processNode(child);
				return;
			}
			if (node.nodeType !== Node.TEXT_NODE) return;
			const text = node.textContent || "";
			if (!text.trim()) return;
			const fragment = document.createDocumentFragment();
			for (const part of text.split(/(\\s+)/)) {
				if (/^\\s+$/.test(part)) {
					fragment.appendChild(document.createTextNode(part));
				} else if (part) {
					const span = document.createElement("span");
					span.setAttribute(wordIndexAttribute, String(wordIndex++));
					span.className = wordClass;
					span.textContent = part;
					fragment.appendChild(span);
				}
			}
			node.parentNode?.replaceChild(fragment, node);
		};

		processNode(document.body);
		spans = Array.from(document.querySelectorAll("[" + wordIndexAttribute + "]"));
	};

	addEventListener("click", (event) => {
		if (getSelection()?.toString().trim()) return;
		if (isInteractiveElement(event.target)) return;
		const visibleWordIndex = wordIndexFromTarget(event.target);
		parent.postMessage(
			{ type: messageTypes.narrationRequest, visibleWordIndex },
			"*"
		);
	});
	addEventListener("message", (event) => {
		const data = event.data;
		if (typeof data !== "object" || data === null) return;
		if (data.type !== messageTypes.narrationHighlight) return;
		const range = validRange(data.range);
		if (range === undefined) return;
		setHighlightRange(range);
	});

	wrapNarrationWords();
	postNarrationReady();
	new ResizeObserver(postHeight).observe(document.documentElement);
	addEventListener("load", () => {
		postHeight();
		postNarrationReady();
	});
	setTimeout(() => {
		postHeight();
		postNarrationReady();
	}, 0);
})();
</script>
</body>
</html>`;
}

export function renderEquationExplanationMathHtml(contentHtml: string) {
	if (typeof document === "undefined" || !contentHtml.includes("<math")) {
		return contentHtml;
	}

	const template = document.createElement("template");
	template.innerHTML = contentHtml;

	for (const math of template.content.querySelectorAll("math")) {
		if (math.closest(".katex") || math.children.length > 0) continue;

		const latex = math.textContent?.trim();
		if (!latex) continue;

		try {
			math.outerHTML = katex.renderToString(latex, {
				displayMode: math.getAttribute("display") === "block",
				output: "htmlAndMathml",
				throwOnError: false,
			});
		} catch {}
	}

	return template.innerHTML;
}

function equationExplanationThemeCss() {
	if (typeof document === "undefined") return "";
	const style = getComputedStyle(document.documentElement);
	const names = [
		"--background",
		"--foreground",
		"--card",
		"--muted-foreground",
		"--primary",
		"--border",
	] as const;
	const variables = names
		.map((name) => `${name}: ${style.getPropertyValue(name).trim()};`)
		.join("\n");
	const scheme =
		document.documentElement.dataset.mode === "light" ? "light" : "dark";
	return `:root { --academic-reader-color-scheme: ${scheme};\n${variables}\n}`;
}
