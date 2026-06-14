import { defaultProcessingConfiguration } from "@academic-reader/shared/processing";
import { createSignal } from "solid-js";

export type UploadStatus =
	| "idle"
	| "requesting"
	| "uploading"
	| "complete"
	| "error";

export type DocumentCreation = ReturnType<typeof createDocumentCreation>;

export function createDocumentCreation() {
	const [file, setFile] = createSignal<File>();
	const [mimeType, setMimeType] = createSignal<string>();
	const [status, setStatus] = createSignal<UploadStatus>("idle");
	const [progress, setProgress] = createSignal(0);
	const [error, setError] = createSignal<string>();
	const [success, setSuccess] = createSignal<string>();
	const [temporaryUploadId, setTemporaryUploadId] = createSignal<string>();
	const [isStarting, setIsStarting] = createSignal(false);
	const [pendingAuth, setPendingAuth] = createSignal(false);
	const [preferenceTouched, setPreferenceTouched] = createSignal(false);
	const [conversionModel, setConversionModel] = createSignal<string>(
		defaultProcessingConfiguration.conversionModel,
	);
	const [pageRange, setPageRange] = createSignal(
		defaultProcessingConfiguration.pageRange,
	);
	const [forceOcr, setForceOcr] = createSignal(
		defaultProcessingConfiguration.markerOptions.forceOcr,
	);
	const [useLlm, setUseLlm] = createSignal(
		defaultProcessingConfiguration.markerOptions.useLlm,
	);
	const [narrationEnabled, setNarrationEnabled] = createSignal(
		defaultProcessingConfiguration.narration.enabled,
	);
	const [narrationVoice, setNarrationVoice] = createSignal<string>(
		defaultProcessingConfiguration.narration.voice,
	);

	return {
		file,
		setFile,
		mimeType,
		setMimeType,
		status,
		setStatus,
		progress,
		setProgress,
		error,
		setError,
		success,
		setSuccess,
		temporaryUploadId,
		setTemporaryUploadId,
		isStarting,
		setIsStarting,
		pendingAuth,
		setPendingAuth,
		preferenceTouched,
		setPreferenceTouched,
		conversionModel,
		setConversionModel,
		pageRange,
		setPageRange,
		forceOcr,
		setForceOcr,
		useLlm,
		setUseLlm,
		narrationEnabled,
		setNarrationEnabled,
		narrationVoice,
		setNarrationVoice,
	};
}

export function clearDocumentDraft(state: DocumentCreation) {
	state.setFile(undefined);
	state.setMimeType(undefined);
	state.setTemporaryUploadId(undefined);
	state.setPendingAuth(false);
	state.setError(undefined);
	state.setProgress(0);
	state.setPageRange(defaultProcessingConfiguration.pageRange);
	state.setStatus("idle");
}

export function uploadFile(
	file: File,
	uploadUrl: string,
	headers: Record<string, string>,
	onProgress: (progress: number) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", uploadUrl);

		for (const [key, value] of Object.entries(headers)) {
			request.setRequestHeader(key, value);
		}

		request.upload.onprogress = (event) => {
			if (!event.lengthComputable) return;
			onProgress(Math.round((event.loaded / event.total) * 100));
		};
		request.onload = () => {
			if (request.status >= 200 && request.status < 300) {
				resolve();
				return;
			}
			reject(new Error(`Upload failed with status ${request.status}`));
		};
		request.onerror = () => reject(new Error("Upload failed"));
		request.send(file);
	});
}

export function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function uploadStatusLabel(status: string) {
	if (status === "requesting") return "Preparing upload";
	if (status === "uploading") return "Uploading";
	if (status === "complete") return "Upload complete";
	if (status === "error") return "Upload failed";
	return "Waiting";
}
