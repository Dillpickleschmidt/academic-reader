import { Buffer } from "node:buffer";
import { Font, woff2 } from "fonteditor-core";
import {
	decodeHtmlEntities,
	type ElementNode,
	elementAttributeValue,
	elementHasClass,
	type HtmlNode,
	parseHtmlFragment,
} from "./html-fragment";

/** Font CSS for a standalone HTML export: @font-face rules subset to the
    characters the fragment (and title) actually renders, plus the KaTeX
    layout CSS when the fragment contains KaTeX markup. `fontFaces` belongs
    before the reader CSS, `katexCss` after. */
export async function standaloneFontCss(input: {
	fragment: string;
	title: string;
}): Promise<{ fontFaces: string; katexCss: string }> {
	const fragmentRoot = parseHtmlFragment(input.fragment);
	const hasKatex = input.fragment.includes("katex");
	const [bodyFonts, katexFonts, katexCss] = await Promise.all([
		bodyFontFaces(extractBodyTextCharacters(fragmentRoot) + input.title),
		hasKatex ? subsetKatexFontFaces(extractKatexFontUsage(fragmentRoot)) : "",
		hasKatex ? katexCssWithoutFontFaces() : "",
	]);

	return {
		fontFaces: [bodyFonts, katexFonts].filter(Boolean).join("\n"),
		katexCss,
	};
}

/** Text characters rendered by the body font (everything outside KaTeX markup). */
function extractBodyTextCharacters(node: HtmlNode): string {
	if (node.kind === "text") return decodeHtmlEntities(node.raw);
	if (node.kind === "raw") return "";
	if (node.kind === "element" && elementHasClass(node, "katex")) return "";
	return node.children.map(extractBodyTextCharacters).join("");
}

/** Per-KaTeX-font character usage, keyed as "family|style|weight". */
function extractKatexFontUsage(node: HtmlNode): Record<string, Set<string>> {
	const usage: Record<string, Set<string>> = {};
	visitKatexHtml(node, false, usage);
	return usage;
}

async function bodyFontFaces(characters: string): Promise<string> {
	const codePoints = uniqueCodePoints(characters);
	const faces = await Promise.all(
		BODY_FONTS.map(async (font) => {
			try {
				const buffer = await subsetFontBuffer(
					await loadFontBuffer(font.file),
					codePoints,
				);
				return fontFaceRule(font.family, font.style, font.weight, buffer);
			} catch {
				return "";
			}
		}),
	);
	return faces.filter(Boolean).join("\n");
}

async function subsetKatexFontFaces(
	fontUsage: Record<string, Set<string>>,
): Promise<string> {
	const faces = await Promise.all(
		Object.entries(fontUsage).map(async ([fontKey, characters]) => {
			const filename = KATEX_FONT_FILES[fontKey];
			const uniqueCharacters = [...characters].join("");
			if (!filename || !uniqueCharacters) return "";

			try {
				const buffer = await subsetFontBuffer(
					await loadFontBuffer(`katex/dist/fonts/${filename}`),
					uniqueCodePoints(uniqueCharacters),
				);
				const [family, style, weight] = fontKey.split("|");
				return fontFaceRule(family, style, weight, buffer);
			} catch {
				return "";
			}
		}),
	);
	return faces.filter(Boolean).join("\n");
}

let cachedKatexCss: Promise<string> | undefined;

function katexCssWithoutFontFaces(): Promise<string> {
	cachedKatexCss ??= readKatexCssWithoutFontFaces();
	return cachedKatexCss;
}

async function readKatexCssWithoutFontFaces(): Promise<string> {
	try {
		const css = await Bun.file(
			new URL("../node_modules/katex/dist/katex.min.css", import.meta.url),
		).text();
		return css.replace(/@font-face\{[^}]+\}/g, "");
	} catch {
		return "";
	}
}

const BODY_FONTS = [
	{ family: "Literata", style: "normal", weight: "400", file: "@fontsource/literata/files/literata-latin-400-normal.woff2" },
	{ family: "Literata", style: "italic", weight: "400", file: "@fontsource/literata/files/literata-latin-400-italic.woff2" },
	{ family: "Literata", style: "normal", weight: "600", file: "@fontsource/literata/files/literata-latin-600-normal.woff2" },
	{ family: "Literata", style: "normal", weight: "700", file: "@fontsource/literata/files/literata-latin-700-normal.woff2" },
];

const KATEX_FONT_MAP: Record<
	string,
	{ family: string; weight: string; style: string }
> = {
	mathnormal: { family: "KaTeX_Math", weight: "400", style: "italic" },
	mathit: { family: "KaTeX_Main", weight: "400", style: "italic" },
	mathrm: { family: "KaTeX_Main", weight: "400", style: "normal" },
	mathbf: { family: "KaTeX_Main", weight: "700", style: "normal" },
	boldsymbol: { family: "KaTeX_Math", weight: "700", style: "italic" },
	mathboldfrak: { family: "KaTeX_Fraktur", weight: "700", style: "normal" },
	mathboldsf: { family: "KaTeX_SansSerif", weight: "700", style: "normal" },
	mathitsf: { family: "KaTeX_SansSerif", weight: "400", style: "italic" },
	mainrm: { family: "KaTeX_Main", weight: "400", style: "normal" },
	textrm: { family: "KaTeX_Main", weight: "400", style: "normal" },
	textbf: { family: "KaTeX_Main", weight: "700", style: "normal" },
	textit: { family: "KaTeX_Main", weight: "400", style: "italic" },
	textsf: { family: "KaTeX_SansSerif", weight: "400", style: "normal" },
	texttt: { family: "KaTeX_Typewriter", weight: "400", style: "normal" },
	textboldsf: { family: "KaTeX_SansSerif", weight: "700", style: "normal" },
	textitsf: { family: "KaTeX_SansSerif", weight: "400", style: "italic" },
	textfrak: { family: "KaTeX_Fraktur", weight: "400", style: "normal" },
	textboldfrak: { family: "KaTeX_Fraktur", weight: "700", style: "normal" },
	textscr: { family: "KaTeX_Script", weight: "400", style: "normal" },
	textbb: { family: "KaTeX_AMS", weight: "400", style: "normal" },
	amsrm: { family: "KaTeX_AMS", weight: "400", style: "normal" },
	mathbb: { family: "KaTeX_AMS", weight: "400", style: "normal" },
	mathcal: { family: "KaTeX_Caligraphic", weight: "400", style: "normal" },
	mathfrak: { family: "KaTeX_Fraktur", weight: "400", style: "normal" },
	mathtt: { family: "KaTeX_Typewriter", weight: "400", style: "normal" },
	mathscr: { family: "KaTeX_Script", weight: "400", style: "normal" },
	mathsf: { family: "KaTeX_SansSerif", weight: "400", style: "normal" },
	"delimsizing size1": { family: "KaTeX_Size1", weight: "400", style: "normal" },
	"delimsizing size2": { family: "KaTeX_Size2", weight: "400", style: "normal" },
	"delimsizing size3": { family: "KaTeX_Size3", weight: "400", style: "normal" },
	"delimsizing size4": { family: "KaTeX_Size4", weight: "400", style: "normal" },
	"delim-size1": { family: "KaTeX_Size1", weight: "400", style: "normal" },
	"delim-size4": { family: "KaTeX_Size4", weight: "400", style: "normal" },
	"small-op": { family: "KaTeX_Size1", weight: "400", style: "normal" },
	"large-op": { family: "KaTeX_Size2", weight: "400", style: "normal" },
};

const KATEX_FONT_FILES: Record<string, string> = {
	"KaTeX_Main|normal|400": "KaTeX_Main-Regular.woff2",
	"KaTeX_Main|normal|700": "KaTeX_Main-Bold.woff2",
	"KaTeX_Main|italic|400": "KaTeX_Main-Italic.woff2",
	"KaTeX_Main|italic|700": "KaTeX_Main-BoldItalic.woff2",
	"KaTeX_Math|italic|400": "KaTeX_Math-Italic.woff2",
	"KaTeX_Math|italic|700": "KaTeX_Math-BoldItalic.woff2",
	"KaTeX_AMS|normal|400": "KaTeX_AMS-Regular.woff2",
	"KaTeX_Caligraphic|normal|400": "KaTeX_Caligraphic-Regular.woff2",
	"KaTeX_Caligraphic|normal|700": "KaTeX_Caligraphic-Bold.woff2",
	"KaTeX_Fraktur|normal|400": "KaTeX_Fraktur-Regular.woff2",
	"KaTeX_Fraktur|normal|700": "KaTeX_Fraktur-Bold.woff2",
	"KaTeX_SansSerif|normal|400": "KaTeX_SansSerif-Regular.woff2",
	"KaTeX_SansSerif|normal|700": "KaTeX_SansSerif-Bold.woff2",
	"KaTeX_SansSerif|italic|400": "KaTeX_SansSerif-Italic.woff2",
	"KaTeX_Script|normal|400": "KaTeX_Script-Regular.woff2",
	"KaTeX_Typewriter|normal|400": "KaTeX_Typewriter-Regular.woff2",
	"KaTeX_Size1|normal|400": "KaTeX_Size1-Regular.woff2",
	"KaTeX_Size2|normal|400": "KaTeX_Size2-Regular.woff2",
	"KaTeX_Size3|normal|400": "KaTeX_Size3-Regular.woff2",
	"KaTeX_Size4|normal|400": "KaTeX_Size4-Regular.woff2",
};

const DEFAULT_KATEX_FONT_KEY = "KaTeX_Main|normal|400";

function visitKatexHtml(
	node: HtmlNode,
	insideKatexHtml: boolean,
	usage: Record<string, Set<string>>,
) {
	if (node.kind === "text" || node.kind === "raw") return;

	const inKatex =
		insideKatexHtml ||
		(node.kind === "element" && elementHasClass(node, "katex-html"));

	if (inKatex && node.kind === "element") {
		const directText = decodeHtmlEntities(
			node.children
				.filter((child) => child.kind === "text")
				.map((child) => (child.kind === "text" ? child.raw : ""))
				.join(""),
		);
		if (directText.trim()) {
			const key = katexFontKeyForElement(node);
			usage[key] ??= new Set();
			for (const character of directText) usage[key].add(character);
		}
	}

	for (const child of node.children) visitKatexHtml(child, inKatex, usage);
}

function katexFontKeyForElement(element: ElementNode): string {
	const classes =
		elementAttributeValue(element, "class")?.split(/\s+/).filter(Boolean) ?? [];

	for (const [pattern, font] of Object.entries(KATEX_FONT_MAP)) {
		if (!pattern.includes(" ")) continue;
		if (pattern.split(" ").every((part) => classes.includes(part))) {
			return `${font.family}|${font.style}|${font.weight}`;
		}
	}
	for (const className of classes) {
		const font = KATEX_FONT_MAP[className];
		if (font) return `${font.family}|${font.style}|${font.weight}`;
	}
	return DEFAULT_KATEX_FONT_KEY;
}

const fontBufferCache = new Map<string, Promise<ArrayBuffer>>();

function loadFontBuffer(packagePath: string): Promise<ArrayBuffer> {
	let cached = fontBufferCache.get(packagePath);
	if (!cached) {
		cached = Bun.file(
			new URL(`../node_modules/${packagePath}`, import.meta.url),
		).arrayBuffer();
		fontBufferCache.set(packagePath, cached);
	}
	return cached;
}

let woff2Initialization: Promise<void> | undefined;

function ensureWoff2Initialized(): Promise<void> {
	woff2Initialization ??= (async () => {
		const wasm = await Bun.file(
			new URL(
				"../node_modules/fonteditor-core/woff2/woff2.wasm",
				import.meta.url,
			),
		).arrayBuffer();
		await woff2.init(wasm);
	})();
	return woff2Initialization;
}

function uniqueCodePoints(characters: string): number[] {
	return [...new Set(characters)]
		.map((character) => character.codePointAt(0))
		.filter((codePoint): codePoint is number => codePoint !== undefined);
}

/* The woff2 wasm is only needed to decode the woff2 source files; subsets are
   written as woff1, whose encoder handles every font the woff2 one rejects
   (hinted TrueType instructions make woff2.encode return an empty buffer).
   Kerning is dropped: fonteditor-core keeps stale pair indices after subset
   reindexing, which collapses the spacing of affected word pairs. */
async function subsetFontBuffer(
	fontBuffer: ArrayBuffer,
	codePoints: number[],
): Promise<Buffer> {
	await ensureWoff2Initialized();

	const font = Font.create(fontBuffer, {
		type: "woff2",
		subset: codePoints,
		hinting: false,
		kerning: false,
	});
	const woff = font.write({ type: "woff" });
	if (woff instanceof ArrayBuffer) return Buffer.from(woff);
	return woff as Buffer;
}

function fontFaceRule(
	family: string,
	style: string,
	weight: string,
	buffer: Buffer,
) {
	const dataUri = `data:font/woff;base64,${buffer.toString("base64")}`;
	return `@font-face {
	font-family: '${family}';
	font-style: ${style};
	font-weight: ${weight};
	font-display: swap;
	src: url(${dataUri}) format('woff');
}`;
}
