import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";

export interface ProcessingEventMessage extends ProcessingEventInput {
	_id: string;
	_creationTime: number;
	sourceDocumentId: string;
}

const processingEventSubscribers = new Map<
	string,
	Set<(event: ProcessingEventMessage) => void>
>();

export function publishProcessingEvent(event: ProcessingEventMessage) {
	const subscribers = processingEventSubscribers.get(event.sourceDocumentId);
	if (!subscribers) return;

	for (const subscriber of subscribers) {
		subscriber(event);
	}
}

export function subscribeToProcessingEvents(
	sourceDocumentId: string,
	notify: (event: ProcessingEventMessage) => void,
) {
	const subscribers =
		processingEventSubscribers.get(sourceDocumentId) ?? new Set();
	subscribers.add(notify);
	processingEventSubscribers.set(sourceDocumentId, subscribers);

	return () => {
		subscribers.delete(notify);
		if (subscribers.size === 0) {
			processingEventSubscribers.delete(sourceDocumentId);
		}
	};
}
