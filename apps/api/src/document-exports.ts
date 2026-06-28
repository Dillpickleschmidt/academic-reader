import type { Id } from "@academic-reader/convex/data-model";
import { prepareBlockContentHtml } from "./block-content";
import {
	documentHtmlExportObjectKey,
	documentMarkdownExportObjectKey,
	imageContentType,
	saveObject,
} from "./storage";

export async function saveDocumentExports(input: {
	documentId: Id<"documents">;
	html: string;
	markdown: string;
	images: Record<string, string>;
}) {
	await Promise.all([
		saveObject(
			documentMarkdownExportObjectKey(input.documentId),
			prepareExportMarkdown(input.markdown, input.images),
			{ contentType: "text/markdown; charset=utf-8" },
		),
		saveObject(
			documentHtmlExportObjectKey(input.documentId),
			prepareExportHtml(input.html, input.images),
			{ contentType: "text/html; charset=utf-8" },
		),
	]);
}

function prepareExportMarkdown(
	markdown: string,
	images: Record<string, string>,
) {
	return inlineExportImagesInMarkdown(markdown, images);
}

function prepareExportHtml(html: string, images: Record<string, string>) {
	return prepareBlockContentHtml(
		inlineExportImagesInHtml(htmlBodyContent(html), images),
	);
}

function htmlBodyContent(html: string) {
	const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
	if (bodyMatch?.[1] !== undefined) return bodyMatch[1];

	return html
		.replace(/<!doctype[^>]*>/i, "")
		.replace(/<head\b[\s\S]*?<\/head>/i, "")
		.replace(/<\/?html\b[^>]*>/gi, "")
		.trim();
}

function inlineExportImagesInHtml(
	html: string,
	images: Record<string, string>,
) {
	return html.replace(
		/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
		(match, prefix: string, quote: string, src: string) => {
			const filename = exportImageFilename(src, images);
			if (!filename) return match;

			return `${prefix}${quote}${exportImageDataUrl(filename, images[filename])}${quote}`;
		},
	);
}

function inlineExportImagesInMarkdown(
	markdown: string,
	images: Record<string, string>,
) {
	return transformMarkdownOutsideCodeFences(markdown, (line) =>
		inlineMarkdownImageLinks(inlineExportImagesInHtml(line, images), images),
	);
}

function transformMarkdownOutsideCodeFences(
	markdown: string,
	transform: (line: string) => string,
) {
	let inFence = false;

	return markdown
		.split(/(?<=\n)/)
		.map((line) => {
			const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
			if (fence) {
				inFence = !inFence;
				return line;
			}
			return inFence ? line : transform(line);
		})
		.join("");
}

function inlineMarkdownImageLinks(
	line: string,
	images: Record<string, string>,
) {
	let output = "";
	let index = 0;

	while (index < line.length) {
		const imageStart = line.indexOf("![", index);
		if (imageStart === -1) {
			output += line.slice(index);
			break;
		}

		const altEnd = findUnescaped(line, "]", imageStart + 2);
		if (altEnd === -1 || line[altEnd + 1] !== "(") {
			output += line.slice(index, imageStart + 2);
			index = imageStart + 2;
			continue;
		}

		const linkEnd = findUnescaped(line, ")", altEnd + 2);
		if (linkEnd === -1) {
			output += line.slice(index);
			break;
		}

		const parsed = markdownLinkDestination(line.slice(altEnd + 2, linkEnd));
		const filename = parsed
			? exportImageFilename(
					unescapeMarkdownDestination(parsed.destination),
					images,
				)
			: undefined;
		if (!parsed || !filename) {
			output += line.slice(index, linkEnd + 1);
			index = linkEnd + 1;
			continue;
		}

		output += `${line.slice(index, altEnd + 2)}${exportImageDataUrl(filename, images[filename])}${parsed.suffix})`;
		index = linkEnd + 1;
	}

	return output;
}

function markdownLinkDestination(value: string) {
	const trimmedStart = value.match(/^\s*/)?.[0] ?? "";
	const content = value.slice(trimmedStart.length);
	if (!content) return undefined;

	if (content.startsWith("<")) {
		const end = content.indexOf(">", 1);
		if (end === -1) return undefined;
		return {
			destination: content.slice(1, end),
			suffix: content.slice(end + 1),
		};
	}

	const match = content.match(/^(\S+)([\s\S]*)$/);
	if (!match) return undefined;
	return { destination: match[1], suffix: match[2] };
}

function unescapeMarkdownDestination(value: string) {
	return value.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

function findUnescaped(value: string, character: string, start: number) {
	for (let index = start; index < value.length; index += 1) {
		if (value[index] === character && !isEscaped(value, index)) return index;
	}
	return -1;
}

function isEscaped(value: string, index: number) {
	let backslashes = 0;
	for (
		let current = index - 1;
		current >= 0 && value[current] === "\\";
		current -= 1
	) {
		backslashes += 1;
	}
	return backslashes % 2 === 1;
}

function exportImageFilename(src: string, images: Record<string, string>) {
	if (src.startsWith("data:")) return undefined;

	let pathname = src;
	try {
		pathname = new URL(src, "http://localhost").pathname;
	} catch {}

	let decoded = pathname;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {}
	decoded = decoded.replace(/^\.\//, "");
	if (images[decoded]) return decoded;

	const basename = decoded.split("/").pop();
	return basename && images[basename] ? basename : undefined;
}

function exportImageDataUrl(filename: string, image: string | undefined) {
	if (!image) return "";
	if (image.startsWith("data:")) return image;
	return `data:${imageContentType(filename)};base64,${image}`;
}
