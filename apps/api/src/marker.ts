const localMarkerUrl = "http://localhost:8800";
const localWorkerAppApiUrl = "http://localhost:8787";

export interface MarkerProcessingInput {
	sourceDocumentId: string;
	fileUrl: string;
	ingestToken: string;
	useLlm: boolean;
	forceOcr: boolean;
	pageRange: string;
}

export async function submitMarkerProcessing(input: MarkerProcessingInput) {
	const backend = requireConversionBackend();
	const response = await fetch(`${markerWorkerUrl(backend)}/run`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			fileUrl: input.fileUrl,
			appApiUrl: workerAppApiUrl(backend),
			sourceDocumentId: input.sourceDocumentId,
			ingestToken: input.ingestToken,
			useLlm: input.useLlm,
			forceOcr: input.forceOcr,
			pageRange: input.pageRange.trim() || null,
		}),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		throw new Error(
			`Marker submit failed (${response.status}): ${await response.text()}`,
		);
	}

	return response.json() as Promise<{ id?: string; status?: string }>;
}

function markerWorkerUrl(backend: "local" | "modal") {
	if (backend === "local") return localMarkerUrl;
	return requireEnv("MODAL_MARKER_URL").replace(/\/$/, "");
}

function workerAppApiUrl(backend: "local" | "modal") {
	const configured = optionalEnv("WORKER_APP_API_URL");
	if (configured) return configured;
	if (backend === "local") return localWorkerAppApiUrl;

	const siteUrl = requireEnv("SITE_URL");
	if (!isLocalUrl(siteUrl)) return siteUrl;

	throw new Error(
		"WORKER_APP_API_URL is required for Modal when SITE_URL is local. `bun run dev` starts a tunnel and sets this automatically.",
	);
}

function requireConversionBackend() {
	const backend = requireEnv("CONVERSION_BACKEND");
	if (backend === "local" || backend === "modal") return backend;

	throw new Error(
		"CONVERSION_BACKEND must be local or modal for Marker conversion",
	);
}

function isLocalUrl(value: string) {
	try {
		const { hostname } = new URL(value);
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function optionalEnv(key: string) {
	return process.env[key]?.trim() || undefined;
}

function requireEnv(key: string) {
	const value = optionalEnv(key);

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}
