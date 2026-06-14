import { api } from "@academic-reader/convex/api";
import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";
import { AuthPanel } from "../features/auth/AuthPanel";
import { ConfigureProcessingFlow } from "../features/documents/DocumentCreationFlow";
import {
	SignedInDocuments,
	SignedOutDocuments,
} from "../features/documents/DocumentLibrary";
import {
	clearDocumentDraft,
	createDocumentCreation,
} from "../features/documents/document-creation";
import { authClient } from "../lib/auth-client";
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
		<main class="min-h-screen bg-stone-950 text-stone-100">
			<div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
				<header class="flex flex-col gap-6 border-stone-800 border-b pb-8 md:flex-row md:items-end md:justify-between">
					<div>
						<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
							Academic Reader
						</p>
						<h1 class="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
							Private document reader
						</h1>
						<p class="mt-4 max-w-2xl text-stone-400">
							Import source documents, inspect processing evidence, and read
							clean Reader Views without hiding the conversion details.
						</p>
					</div>
					<Show when={!creation.file()}>
						<AuthPanel />
					</Show>
				</header>

				<Show
					when={!session().isPending}
					fallback={
						<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
							<h2 class="text-2xl font-semibold">Checking session</h2>
							<p class="mt-3 text-stone-400">Preparing Academic Reader…</p>
						</section>
					}
				>
					<Show
						when={creation.file()}
						fallback={
							<Show
								when={session().data?.user}
								fallback={<SignedOutDocuments creation={creation} />}
							>
								{(reader) => (
									<SignedInDocuments
										readerName={reader().name || reader().email}
										documents={documents.data()}
										error={documents.error()}
										creation={creation}
									/>
								)}
							</Show>
						}
					>
						<ConfigureProcessingFlow
							state={creation}
							onBack={() => clearDocumentDraft(creation)}
						/>
					</Show>
				</Show>
			</div>
		</main>
	);
}
