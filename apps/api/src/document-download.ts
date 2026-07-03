import type { Id } from "@academic-reader/convex/data-model";
import { api, createConvexHttpClient } from "./convex";
import { standaloneFontCss } from "./font-subsetting";
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
	const fonts = await standaloneFontCss(input);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
${fonts.fontFaces}
${standaloneReaderCss}
${fonts.katexCss}
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

function escapeHtml(text: string) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
