import { createHmac, timingSafeEqual } from "node:crypto";

export function createProcessingEventIngestToken(input: {
	serviceSecret: string;
	documentId: string;
	processingRunStartedAt: number;
}) {
	return createHmac("sha256", input.serviceSecret)
		.update(`${input.documentId}:${input.processingRunStartedAt}`)
		.digest("hex");
}

export function isMatchingProcessingEventIngestToken(input: {
	actualToken: string;
	expectedToken: string;
}) {
	try {
		return timingSafeEqual(
			Buffer.from(input.actualToken, "hex"),
			Buffer.from(input.expectedToken, "hex"),
		);
	} catch {
		return false;
	}
}
