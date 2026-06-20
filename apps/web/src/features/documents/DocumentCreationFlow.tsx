import { api } from "@academic-reader/convex/api";
import { narrationVoices } from "@academic-reader/shared/processing";
import { sourceDocumentAcceptAttribute } from "@academic-reader/shared/uploads";
import { useQuery } from "convex-solidjs";
import { createEffect, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { authClient } from "../../lib/auth-client";
import { fetchJson } from "../../lib/fetch-json";
import { useConvexAuth } from "../../providers/convex";
import { AuthPanel } from "../auth/AuthPanel";
import {
	clearDocumentDraft,
	type DocumentCreation,
	selectSourceDocument,
	uploadStatusLabel,
} from "./document-creation";

export function UploadPrompt(props: { state: DocumentCreation }) {
	const state = props.state;

	return (
		<div>
			<label class="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center transition-colors hover:border-primary">
				<span class="font-medium text-foreground">Choose a PDF or image</span>
				<span class="mt-2 text-muted-foreground text-sm">
					PDF, PNG, JPEG, WebP, or TIFF up to 50MB
				</span>
				<input
					accept={sourceDocumentAcceptAttribute}
					class="sr-only"
					type="file"
					onChange={(event) =>
						void selectSourceDocument(state, event.currentTarget.files?.[0])
					}
				/>
			</label>

			<Show when={state.success()}>
				{(message) => <p class="mt-3 text-tertiary text-sm">{message()}</p>}
			</Show>
			<Show when={state.error()}>
				{(message) => <p class="mt-3 text-destructive text-sm">{message()}</p>}
			</Show>
		</div>
	);
}

export function AddDocumentButton(props: { state: DocumentCreation }) {
	return (
		<label class="inline-flex cursor-pointer items-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90">
			Add document
			<input
				accept={sourceDocumentAcceptAttribute}
				class="sr-only"
				type="file"
				onChange={(event) =>
					void selectSourceDocument(props.state, event.currentTarget.files?.[0])
				}
			/>
		</label>
	);
}

export function ConfigureProcessingModal(props: {
	state: DocumentCreation;
	onClose: () => void;
}) {
	return (
		<Dialog
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) props.onClose();
			}}
		>
			<DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogTitle class="sr-only">Configure processing run</DialogTitle>
				<ConfigureProcessingFlow state={props.state} onBack={props.onClose} />
			</DialogContent>
		</Dialog>
	);
}

function ConfigureProcessingFlow(props: {
	state: DocumentCreation;
	onBack: () => void;
}) {
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const preferences = useQuery(
		api.api.configurationPreferences.get,
		{},
		() => ({
			enabled: convexAuth.isAuthenticated(),
		}),
	);
	const state = props.state;

	createEffect(() => {
		const savedPreferences = preferences.data();
		if (!savedPreferences || state.preferenceTouched()) return;

		state.setConversionModel(savedPreferences.conversionModel);
		state.setForceOcr(savedPreferences.markerForceOcr);
		state.setUseLlm(savedPreferences.markerUseLlm);
		state.setNarrationEnabled(savedPreferences.narrationEnabled);
		state.setNarrationVoice(savedPreferences.narrationVoice);
	});

	createEffect(() => {
		if (!state.pendingAuth()) return;
		if (!session().data?.user || !convexAuth.isAuthenticated()) return;
		if (state.status() !== "complete" || state.isStarting()) return;

		void startProcessing();
	});

	async function startProcessing() {
		const selectedFile = state.file();
		const mimeType = state.mimeType();
		const temporaryUploadId = state.temporaryUploadId();

		if (
			state.status() !== "complete" ||
			!selectedFile ||
			!mimeType ||
			!temporaryUploadId
		) {
			return;
		}
		if (!session().data?.user) {
			state.setError(undefined);
			state.setPendingAuth(true);
			return;
		}
		if (!convexAuth.isAuthenticated()) {
			state.setError("Finishing sign-in; try again in a moment.");
			return;
		}

		state.setError(undefined);
		state.setSuccess(undefined);
		state.setPendingAuth(false);
		state.setIsStarting(true);

		try {
			const { data } = await authClient.convex.token({
				fetchOptions: { throw: false },
			});
			const token = data?.token;
			if (!token) throw new Error("Could not authenticate Document creation");

			const payload = await fetchJson<{ processingStarted: boolean }>(
				"/api/documents",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						temporaryUploadId,
						filename: selectedFile.name,
						mimeType,
						sizeBytes: selectedFile.size,
						processingConfiguration: {
							conversionModel: state.conversionModel(),
							pageRange: state.pageRange(),
							markerOptions: {
								forceOcr: state.forceOcr(),
								useLlm: state.useLlm(),
							},
							narration: {
								enabled: state.narrationEnabled(),
								voice: state.narrationVoice(),
							},
						},
					}),
				},
				"Could not start processing",
			);

			clearDocumentDraft(state);
			state.setSuccess(
				payload.processingStarted
					? "Document created and processing started."
					: "Document created, but Marker did not start. Check Processing Events.",
			);
		} catch (startError) {
			state.setError(
				startError instanceof Error
					? startError.message
					: "Could not start processing",
			);
		} finally {
			state.setIsStarting(false);
		}
	}

	function updatePreference(update: () => void) {
		state.setPreferenceTouched(true);
		update();
	}

	return (
		<Show when={state.file()}>
			{(selectedFile) => (
				<div class="flex flex-col gap-6">
					<header>
						<p class="font-mono text-dim text-xs uppercase tracking-[0.25em]">
							Configure run
						</p>
						<h2 class="mt-2 truncate font-semibold text-xl tracking-tight">
							{selectedFile().name}
						</h2>
					</header>

					<div class="grid gap-8 border-border border-t pt-6 md:grid-cols-[minmax(0,1fr)_240px]">
						<div class="flex flex-col gap-6">
							<section>
								<p class="font-mono text-dim text-xs uppercase tracking-[0.25em]">
									Conversion
								</p>
								<div class="mt-4 flex flex-col gap-4">
									<div class="flex items-center justify-between gap-4">
										<span class="text-foreground text-sm">Model</span>
										<select
											class="rounded-lg border border-border bg-background px-3 py-1.5 text-foreground text-sm outline-none focus:border-primary"
											value={state.conversionModel()}
											onChange={(event) =>
												updatePreference(() =>
													state.setConversionModel(event.currentTarget.value),
												)
											}
										>
											<option value="marker">Marker</option>
										</select>
									</div>

									<div class="flex items-center justify-between gap-4">
										<span class="text-foreground text-sm">
											Page range <span class="text-dim">optional</span>
										</span>
										<input
											class="w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-foreground text-sm outline-none focus:border-primary"
											placeholder="e.g. 1-5, 10, 15-20"
											value={state.pageRange()}
											onInput={(event) =>
												state.setPageRange(event.currentTarget.value)
											}
										/>
									</div>

									<label class="flex cursor-pointer items-start justify-between gap-4">
										<span class="text-sm">
											<span class="text-foreground">Force OCR</span>
											<span class="mt-0.5 block text-dim text-xs">
												Re-OCR pages even when extractable text exists.
											</span>
										</span>
										<input
											checked={state.forceOcr()}
											class="mt-0.5 size-4 accent-primary"
											type="checkbox"
											onChange={(event) =>
												updatePreference(() =>
													state.setForceOcr(event.currentTarget.checked),
												)
											}
										/>
									</label>

									<label class="flex cursor-pointer items-start justify-between gap-4">
										<span class="text-sm">
											<span class="text-foreground">Enhanced detection</span>
											<span class="mt-0.5 block text-dim text-xs">
												Use Marker LLM-assisted detection when available.
											</span>
										</span>
										<input
											checked={state.useLlm()}
											class="mt-0.5 size-4 accent-primary"
											type="checkbox"
											onChange={(event) =>
												updatePreference(() =>
													state.setUseLlm(event.currentTarget.checked),
												)
											}
										/>
									</label>
								</div>
							</section>

							<section class="border-border border-t pt-6">
								<p class="font-mono text-dim text-xs uppercase tracking-[0.25em]">
									Narration
								</p>
								<div class="mt-4 flex flex-col gap-4">
									<label class="flex cursor-pointer items-start justify-between gap-4">
										<span class="text-sm">
											<span class="text-foreground">Generate narration</span>
											<span class="mt-0.5 block text-dim text-xs">
												Create spoken audio once the Reader View is ready.
											</span>
										</span>
										<input
											checked={state.narrationEnabled()}
											class="mt-0.5 size-4 accent-primary"
											type="checkbox"
											onChange={(event) =>
												updatePreference(() =>
													state.setNarrationEnabled(
														event.currentTarget.checked,
													),
												)
											}
										/>
									</label>

									<div class="flex items-center justify-between gap-4">
										<span
											class="text-sm"
											classList={{
												"text-foreground": state.narrationEnabled(),
												"text-dim": !state.narrationEnabled(),
											}}
										>
											Voice
										</span>
										<select
											class="rounded-lg border border-border bg-background px-3 py-1.5 text-foreground text-sm outline-none focus:border-primary disabled:opacity-50"
											disabled={!state.narrationEnabled()}
											value={state.narrationVoice()}
											onChange={(event) =>
												updatePreference(() =>
													state.setNarrationVoice(event.currentTarget.value),
												)
											}
										>
											<For each={narrationVoices}>
												{(voice) => (
													<option value={voice.id}>{voice.label}</option>
												)}
											</For>
										</select>
									</div>
								</div>
							</section>
						</div>

						<aside class="flex flex-col gap-4 border-border border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
							<p class="font-mono text-dim text-xs uppercase tracking-[0.25em]">
								Create
							</p>

							<Show
								when={
									state.status() !== "idle" && state.status() !== "complete"
								}
							>
								<div>
									<div class="flex justify-between font-mono text-dim text-xs">
										<span>{uploadStatusLabel(state.status())}</span>
										<span>{Math.round(state.progress())}%</span>
									</div>
									<div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
										<div
											class="h-full rounded-full bg-primary transition-[width] duration-300"
											style={{ width: `${state.progress()}%` }}
										/>
									</div>
								</div>
							</Show>

							<Show when={state.error()}>
								{(message) => (
									<p class="text-destructive text-sm">{message()}</p>
								)}
							</Show>

							<Show
								when={session().data?.user}
								fallback={
									<div class="flex flex-col gap-3">
										<p class="text-muted-foreground text-xs">
											Sign in when you start — your settings are kept.
										</p>
										<button
											class="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
											disabled={state.status() !== "complete"}
											type="button"
											onClick={startProcessing}
										>
											{state.status() === "complete"
												? "Sign in to start"
												: "Uploading…"}
										</button>
										<button
											class="w-full rounded-lg border border-border px-4 py-2 text-foreground text-sm hover:bg-muted"
											type="button"
											onClick={props.onBack}
										>
											Cancel
										</button>
									</div>
								}
							>
								{(reader) => (
									<div class="flex flex-col gap-4">
										<div>
											<p class="font-mono text-dim text-xs">Signed in as</p>
											<p class="truncate text-foreground text-sm">
												{reader().email}
											</p>
										</div>
										<div class="flex flex-col gap-2">
											<button
												class="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
												disabled={
													state.status() !== "complete" ||
													state.isStarting() ||
													!convexAuth.isAuthenticated()
												}
												type="button"
												onClick={startProcessing}
											>
												{state.isStarting()
													? "Starting…"
													: convexAuth.isAuthenticated()
														? "Start processing"
														: "Finishing sign-in…"}
											</button>
											<button
												class="w-full rounded-lg border border-border px-4 py-2 text-foreground text-sm hover:bg-muted"
												type="button"
												onClick={props.onBack}
											>
												Cancel
											</button>
										</div>
									</div>
								)}
							</Show>
						</aside>
					</div>

					<Show when={state.pendingAuth() && !session().data?.user}>
						<div class="border-border border-t pt-6">
							<p class="mb-4 text-muted-foreground text-sm">
								Sign in or create an account. Processing starts once sign-in
								finishes.
							</p>
							<AuthPanel />
						</div>
					</Show>
				</div>
			)}
		</Show>
	);
}
