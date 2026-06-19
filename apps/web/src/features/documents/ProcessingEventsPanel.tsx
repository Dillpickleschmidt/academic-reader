import { api } from "@academic-reader/convex/api";
import type { Id } from "@academic-reader/convex/data-model";
import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";
import { useConvexAuth } from "../../providers/convex";
import { ProcessingEventsList } from "./ProcessingEventsList";

export function ProcessingEventsPanel(props: { documentId: Id<"documents"> }) {
	const convexAuth = useConvexAuth();
	const persistedEvents = useQuery(
		api.api.processingEvents.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);

	return (
		<div class="mt-4 rounded-xl border border-stone-800 bg-stone-950 p-4">
			<div class="flex items-center justify-between gap-4">
				<h3 class="font-medium text-sm text-stone-200">Processing Events</h3>
			</div>

			<Show when={persistedEvents.error()}>
				{(error) => <p class="mt-3 text-red-300 text-sm">{error().message}</p>}
			</Show>

			<ProcessingEventsList events={persistedEvents.data()} />
		</div>
	);
}
