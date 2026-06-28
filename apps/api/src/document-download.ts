import { Buffer } from "node:buffer";
import type { Id } from "@academic-reader/convex/data-model";
import { api, createConvexHttpClient } from "./convex";
import {
	documentHtmlExportObjectKey,
	documentMarkdownExportObjectKey,
	getObjectBytes,
} from "./storage";
import standaloneReaderCss from "./styles/standalone-reader.css" with {
	type: "text",
};

export async function createDocumentDownload(input: {
	authToken: string;
	documentId: Id<"documents">;
	format: "html" | "markdown";
}) {
	const document = await createConvexHttpClient(input.authToken).query(
		api.api.documents.get,
		{ documentId: input.documentId },
	);
	const title = documentTitle(document.filename);

	if (input.format === "markdown") {
		return {
			content: await readObjectText(
				documentMarkdownExportObjectKey(input.documentId),
			),
			contentType: "text/markdown; charset=utf-8",
			filename: `${title}.md`,
		};
	}

	const fragment = await readObjectText(
		documentHtmlExportObjectKey(input.documentId),
	);

	return {
		content: await standaloneHtmlDocument({ title, fragment }),
		contentType: "text/html; charset=utf-8",
		filename: `${title}.html`,
	};
}

function documentTitle(filename: string) {
	return (
		filename
			.replace(/\.[^/.]+$/, "")
			.replace(/[\\/:*?"<>|]+/g, "-")
			.trim() || "document"
	);
}

async function readObjectText(objectKey: string) {
	return new TextDecoder().decode(await getObjectBytes(objectKey));
}

async function standaloneHtmlDocument(input: {
	title: string;
	fragment: string;
}) {
	const katexCss = input.fragment.includes("katex")
		? await standaloneKatexCss()
		: "";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
${standaloneReaderCss}
${katexCss}
</style>
</head>
<body>
<main class="reader-output">
<div class="reader-view">
${input.fragment}
</div>
</main>
</body>
</html>`;
}

let cachedKatexCss: Promise<string> | undefined;

function standaloneKatexCss() {
	cachedKatexCss ??= readStandaloneKatexCss();
	return cachedKatexCss;
}

async function readStandaloneKatexCss() {
	try {
		const css = await Bun.file(
			new URL("../node_modules/katex/dist/katex.min.css", import.meta.url),
		).text();
		return inlineKatexFontUrls(css);
	} catch {
		return "";
	}
}

async function inlineKatexFontUrls(css: string) {
	const filenames = Array.from(
		new Set(
			Array.from(
				css.matchAll(/url\((?:["'])?fonts\/([^"')]+)(?:["'])?\)/g),
			).map((match) => match[1]),
		),
	);
	const dataUrls = new Map<string, string>();

	await Promise.all(
		filenames.map(async (filename) => {
			try {
				const bytes = await Bun.file(
					new URL(
						`../node_modules/katex/dist/fonts/${filename}`,
						import.meta.url,
					),
				).arrayBuffer();
				dataUrls.set(
					filename,
					`data:${fontContentType(filename)};base64,${Buffer.from(bytes).toString("base64")}`,
				);
			} catch {}
		}),
	);

	return css.replace(
		/url\((?:["'])?fonts\/([^"')]+)(?:["'])?\)/g,
		(match, filename: string) => {
			const dataUrl = dataUrls.get(filename);
			return dataUrl ? `url(${dataUrl})` : match;
		},
	);
}

function fontContentType(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();
	if (ext === "woff2") return "font/woff2";
	if (ext === "woff") return "font/woff";
	if (ext === "ttf") return "font/ttf";
	return "application/octet-stream";
}

function escapeHtml(text: string) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
