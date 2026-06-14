type ProcessingEvent = {
	_id: string;
	documentId: string;
};

export type ProcessingEventMessage = ProcessingEvent & Record<string, unknown>;

type ProcessingEventSubscriber = (event: ProcessingEventMessage) => void;

const processingEventSubscribers = new Map<
	string,
	Set<ProcessingEventSubscriber>
>();

export function publishProcessingEvent(event: ProcessingEventMessage) {
	const subscribers = processingEventSubscribers.get(event.documentId);
	if (!subscribers) return;

	for (const subscriber of subscribers) {
		subscriber(event);
	}
}

export function subscribeToProcessingEvents(
	documentId: string,
	subscriber: ProcessingEventSubscriber,
) {
	const subscribers = processingEventSubscribers.get(documentId) ?? new Set();
	subscribers.add(subscriber);
	processingEventSubscribers.set(documentId, subscribers);

	return () => {
		subscribers.delete(subscriber);
		if (subscribers.size === 0) {
			processingEventSubscribers.delete(documentId);
		}
	};
}
