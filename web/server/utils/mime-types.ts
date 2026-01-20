/** Image MIME types for upload and embedding. */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

/** Get MIME type for a filename extension, defaults to image/png. */
export function getImageMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "png"
  return IMAGE_MIME_TYPES[ext] ?? "image/png"
}
