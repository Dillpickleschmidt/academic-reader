import { createHmac, timingSafeEqual } from "node:crypto";

export function createProcessingEventIngestToken(input: {
	serviceSecret: string;
	sourceDocumentId: string;
	processingRunStartedAt: number;
}) {
	return createHmac("sha256", input.serviceSecret)
		.update(`${input.sourceDocumentId}:${input.processingRunStartedAt}`)
		.digest("hex");
}

export function isMatchingProcessingEventIngestToken(input: {
	actualToken: string;
	expectedToken: string;
}) {
	const actual = Buffer.from(input.actualToken, "utf8");
	const expected = Buffer.from(input.expectedToken, "utf8");

	if (actual.length !== expected.length) {
		return false;
	}

	return timingSafeEqual(actual, expected);
}
