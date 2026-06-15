export function parseJsonObject<T>(text: string): T {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
	const jsonText = fenced ?? trimmed;
	return JSON.parse(jsonText) as T;
}
