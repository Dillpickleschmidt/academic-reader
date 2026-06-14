import type { Doc } from "@academic-reader/convex/data-model";

export function extractBlockImageFilenames(
	blocks: Doc<"blocks">[],
	documentId: string,
) {
	const filenames = new Set<string>();

	for (const block of blocks) {
		for (const src of imageSources(block.contentHtml)) {
			const filename = documentImageFilename(documentId, src);
			if (filename) filenames.add(filename);
		}
	}

	return Array.from(filenames).sort();
}

export function rewriteBlockImageUrls(
	html: string,
	documentId: string,
	imageUrls: Record<string, string>,
) {
	return html.replace(
		/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
		(match, prefix: string, quote: string, src: string) => {
			const filename = documentImageFilename(documentId, src);
			const url = filename ? imageUrls[filename] : undefined;
			if (!url) return match;

			return `${prefix}${quote}${escapeAttributeValue(url, quote)}${quote}`;
		},
	);
}

export function imageSources(html: string) {
	const sources: string[] = [];
	const pattern = /<img\b[^>]*\bsrc=(["'])([^"']+)\1/gi;
	let match = pattern.exec(html);

	while (match) {
		sources.push(match[2]);
		match = pattern.exec(html);
	}

	return sources;
}

function documentImageFilename(documentId: string, src: string) {
	let pathname: string;
	try {
		pathname = new URL(src, window.location.origin).pathname;
	} catch {
		return undefined;
	}

	const match = pathname.match(/^\/api\/documents\/([^/]+)\/images\/(.+)$/);
	if (!match) return undefined;
	if (decodeURIComponent(match[1]) !== documentId) return undefined;
	return decodeURIComponent(match[2]);
}

function escapeAttributeValue(value: string, quote: string) {
	let escaped = value.replaceAll("&", "&amp;");
	if (quote === '"') escaped = escaped.replaceAll('"', "&quot;");
	else escaped = escaped.replaceAll("'", "&#39;");
	return escaped;
}
