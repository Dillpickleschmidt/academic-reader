export const sourceDocumentMaxSizeBytes = 50 * 1024 * 1024;

export const sourceDocumentMimeTypes = [
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/tiff",
] as const;

export type SourceDocumentMimeType = (typeof sourceDocumentMimeTypes)[number];

export const sourceDocumentAcceptAttribute = `${sourceDocumentMimeTypes.join(",")},.tif,.tiff`;

const sourceDocumentMimeTypesByExtension: Record<string, SourceDocumentMimeType> = {
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	tif: "image/tiff",
	tiff: "image/tiff",
};

export function sourceDocumentMimeTypeForFile(
	filename: string,
	mimeType: string,
) {
	if (sourceDocumentMimeTypes.includes(mimeType as SourceDocumentMimeType)) {
		return mimeType as SourceDocumentMimeType;
	}

	const extension = filename.split(".").pop()?.toLowerCase();
	return extension ? sourceDocumentMimeTypesByExtension[extension] : undefined;
}
