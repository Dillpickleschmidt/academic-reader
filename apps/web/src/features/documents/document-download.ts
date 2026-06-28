import type { Id } from "@academic-reader/convex/data-model";
import { authClient } from "../../lib/auth-client";

export type DocumentDownloadFormat = "html" | "markdown";

export async function downloadDocumentExport(input: {
	documentId: Id<"documents">;
	filename: string;
	format: DocumentDownloadFormat;
}) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Document download");

	const params = new URLSearchParams({ format: input.format });
	const response = await fetch(
		`/api/documents/${encodeURIComponent(input.documentId)}/download?${params}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);

	if (!response.ok) {
		throw new Error(await downloadErrorMessage(response));
	}

	const blobUrl = URL.createObjectURL(await response.blob());
	const anchor = document.createElement("a");
	anchor.href = blobUrl;
	anchor.download = downloadFilename(input.filename, input.format);
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function downloadErrorMessage(response: Response) {
	const body = await response.text();
	if (body) {
		try {
			const payload = JSON.parse(body) as { error?: unknown };
			if (typeof payload.error === "string" && payload.error) {
				return payload.error;
			}
		} catch {}
	}

	return `Download failed (${response.status} ${response.statusText || "HTTP error"})`;
}

function downloadFilename(filename: string, format: DocumentDownloadFormat) {
	const baseName = filename.replace(/\.[^/.]+$/, "").trim() || "document";
	return `${baseName}.${format === "markdown" ? "md" : "html"}`;
}
