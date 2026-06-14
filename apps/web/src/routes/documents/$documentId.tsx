import type { Id } from "@academic-reader/convex/data-model";
import { createFileRoute } from "@tanstack/solid-router";
import { DocumentPage } from "../../features/documents/DocumentPage";

export const Route = createFileRoute("/documents/$documentId")({
	component: DocumentRoute,
});

function DocumentRoute() {
	const params = Route.useParams();
	return <DocumentPage documentId={params().documentId as Id<"documents">} />;
}
