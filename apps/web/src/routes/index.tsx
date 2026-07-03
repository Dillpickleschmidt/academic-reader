import { api } from "@academic-reader/convex/api";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { ConfigureProcessingModal } from "../features/documents/DocumentCreationFlow";
import {
	SignedInDocuments,
	SignedOutDocuments,
} from "../features/documents/DocumentLibrary";
import {
	clearDocumentDraft,
	createDocumentCreation,
} from "../features/documents/document-creation";
import { authClient } from "../lib/auth-client";
import { useQuery } from "../lib/convex-query";
import { useConvexAuth } from "../providers/convex";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const creation = createDocumentCreation();
	const documents = useQuery(api.api.documents.list, {}, () => ({
		enabled: convexAuth.isAuthenticated(),
	}));

	return (
		<main class="min-h-screen bg-background text-foreground">
			<div class="mx-auto w-full max-w-2xl px-6 pt-14 pb-28 sm:pt-20">
				<Show
					when={!session().isPending}
					fallback={
						<p class="text-muted-foreground text-sm">
							Preparing your reading room…
						</p>
					}
				>
					<Show
						when={session().data?.user}
						fallback={<SignedOutDocuments creation={creation} />}
					>
						<SignedInDocuments
							documents={documents.data()}
							error={documents.error()}
							creation={creation}
						/>
					</Show>
				</Show>
			</div>

			<Show when={creation.file()}>
				<ConfigureProcessingModal
					state={creation}
					onClose={() => clearDocumentDraft(creation)}
				/>
			</Show>
		</main>
	);
}
