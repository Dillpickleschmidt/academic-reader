export async function fetchJson<T>(
	input: RequestInfo | URL,
	init: RequestInit,
	fallbackMessage: string,
): Promise<T> {
	const response = await fetch(input, init);
	const body = await response.text();
	let payload: unknown;

	if (body) {
		try {
			payload = JSON.parse(body);
		} catch {
			if (response.ok) throw new Error(`${fallbackMessage} (invalid response)`);
		}
	}

	if (!response.ok) {
		throw new Error(
			errorPayload(payload) ??
				`${fallbackMessage} (${response.status} ${response.statusText || "HTTP error"})`,
		);
	}
	if (payload === undefined)
		throw new Error(`${fallbackMessage} (empty response)`);

	return payload as T;
}

function errorPayload(payload: unknown) {
	if (!payload || typeof payload !== "object") return undefined;
	const error = (payload as { error?: unknown }).error;
	return typeof error === "string" && error ? error : undefined;
}
