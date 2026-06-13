import { api } from "@academic-reader/convex/api";
import {
	defaultProcessingConfiguration,
	narrationVoices,
} from "@academic-reader/shared/processing";
import {
	sourceDocumentAcceptAttribute,
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypeForFile,
} from "@academic-reader/shared/uploads";
import { useQuery } from "convex-solidjs";
import { createEffect, For, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";
import { useConvexAuth } from "../../providers/convex";
import { AuthPanel } from "../auth/AuthPanel";
import {
	clearSourceDocumentDraft,
	formatBytes,
	type SourceDocumentCreation,
	uploadFile,
	uploadStatusLabel,
} from "./source-document-creation";

export function UploadPrompt(props: { state: SourceDocumentCreation }) {
	const state = props.state;

	async function selectFile(selectedFile: File | undefined) {
		if (!selectedFile) return;

		const mimeType = sourceDocumentMimeTypeForFile(
			selectedFile.name,
			selectedFile.type,
		);
		if (!mimeType) {
			state.setError("Choose a PDF, PNG, JPEG, WebP, or TIFF file.");
			state.setStatus("error");
			return;
		}
		if (selectedFile.size > sourceDocumentMaxSizeBytes) {
			state.setError("Source Documents must be 50MB or smaller.");
			state.setStatus("error");
			return;
		}

		state.setFile(selectedFile);
		state.setMimeType(mimeType);
		state.setError(undefined);
		state.setSuccess(undefined);
		state.setPendingAuth(false);
		state.setTemporaryUploadId(undefined);
		state.setPageRange(defaultProcessingConfiguration.pageRange);
		state.setProgress(0);
		state.setStatus("requesting");

		try {
			const response = await fetch("/api/uploads/temporary", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filename: selectedFile.name,
					mimeType,
					sizeBytes: selectedFile.size,
				}),
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error || "Could not create upload URL");
			}

			state.setTemporaryUploadId(payload.temporaryUploadId);
			state.setStatus("uploading");
			await uploadFile(
				selectedFile,
				payload.uploadUrl,
				payload.headers,
				state.setProgress,
			);
			state.setProgress(100);
			state.setStatus("complete");
		} catch (uploadError) {
			state.setStatus("error");
			state.setError(
				uploadError instanceof Error ? uploadError.message : "Upload failed",
			);
		}
	}

	return (
		<div>
			<label class="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-6 text-center hover:border-amber-300">
				<span class="font-medium text-stone-100">Choose source document</span>
				<span class="mt-2 text-sm text-stone-500">
					PDF, PNG, JPEG, WebP, or TIFF up to 50MB
				</span>
				<input
					accept={sourceDocumentAcceptAttribute}
					class="sr-only"
					type="file"
					onChange={(event) => selectFile(event.currentTarget.files?.[0])}
				/>
			</label>

			<Show when={state.success()}>
				{(message) => <p class="mt-3 text-green-300 text-sm">{message()}</p>}
			</Show>
			<Show when={state.error()}>
				{(message) => <p class="mt-3 text-red-300 text-sm">{message()}</p>}
			</Show>
		</div>
	);
}

export function ConfigureProcessingFlow(props: {
	state: SourceDocumentCreation;
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
			if (!token)
				throw new Error("Could not authenticate Source Document creation");

			const response = await fetch("/api/source-documents", {
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
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error || "Could not start processing");
			}

			clearSourceDocumentDraft(state);
			state.setSuccess(
				payload.processingStarted
					? "Source Document created and processing started."
					: "Source Document created, but Marker did not start. Check Processing Events.",
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
				<section class="grid gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
					<div class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
						<button
							class="mb-6 rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-sm hover:bg-stone-800"
							type="button"
							onClick={props.onBack}
						>
							Back
						</button>

						<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
							Processing Configuration
						</p>
						<h2 class="mt-3 text-3xl font-semibold tracking-tight">
							{selectedFile().name}
						</h2>
						<p class="mt-2 text-sm text-stone-500">
							{formatBytes(selectedFile().size)} · Marker conversion
						</p>

						<div class="mt-6 space-y-2">
							<div class="flex justify-between text-sm text-stone-400">
								<span>{uploadStatusLabel(state.status())}</span>
								<span>{Math.round(state.progress())}%</span>
							</div>
							<progress class="h-2 w-full" max="100" value={state.progress()} />
						</div>

						<div class="mt-8 space-y-5">
							<label class="flex flex-col gap-1 text-sm text-stone-300">
								Conversion Model
								<select
									class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
									value={state.conversionModel()}
									onChange={(event) =>
										updatePreference(() =>
											state.setConversionModel(event.currentTarget.value),
										)
									}
								>
									<option value="marker">Marker</option>
								</select>
							</label>

							<label class="flex flex-col gap-1 text-sm text-stone-300">
								Page Range <span class="text-stone-500">optional</span>
								<input
									class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
									placeholder="All pages — or 1-5, 10, 15-20"
									value={state.pageRange()}
									onInput={(event) =>
										state.setPageRange(event.currentTarget.value)
									}
								/>
							</label>

							<div class="rounded-xl border border-stone-800 p-4">
								<p class="font-medium text-sm text-stone-200">Marker Options</p>
								<label class="mt-3 flex items-start gap-3 text-sm text-stone-300">
									<input
										checked={state.forceOcr()}
										class="mt-1"
										type="checkbox"
										onChange={(event) =>
											updatePreference(() =>
												state.setForceOcr(event.currentTarget.checked),
											)
										}
									/>
									<span>
										Force OCR
										<span class="block text-stone-500 text-xs">
											Re-OCR pages even when extractable text exists.
										</span>
									</span>
								</label>
								<label class="mt-3 flex items-start gap-3 text-sm text-stone-300">
									<input
										checked={state.useLlm()}
										class="mt-1"
										type="checkbox"
										onChange={(event) =>
											updatePreference(() =>
												state.setUseLlm(event.currentTarget.checked),
											)
										}
									/>
									<span>
										Enhanced detection
										<span class="block text-stone-500 text-xs">
											Use Marker LLM-assisted detection when available.
										</span>
									</span>
								</label>
							</div>

							<div class="rounded-xl border border-stone-800 p-4">
								<label class="flex items-center justify-between gap-3 text-sm text-stone-300">
									<span class="font-medium text-stone-200">Narration</span>
									<input
										checked={state.narrationEnabled()}
										type="checkbox"
										onChange={(event) =>
											updatePreference(() =>
												state.setNarrationEnabled(event.currentTarget.checked),
											)
										}
									/>
								</label>
								<label class="mt-3 flex flex-col gap-1 text-sm text-stone-300">
									Narration voice
									<select
										class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400 disabled:opacity-50"
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
								</label>
							</div>
						</div>
					</div>

					<aside class="rounded-3xl border border-stone-800 bg-stone-900/50 p-6">
						<h3 class="font-semibold text-xl">Create Source Document</h3>
						<p class="mt-2 text-sm text-stone-400">
							Processing starts only after the API creates the Source Document
							and hands it to Marker.
						</p>

						<div class="mt-6 rounded-xl border border-stone-800 bg-stone-950 p-4 text-sm">
							<div class="flex justify-between gap-4 text-stone-400">
								<span>Upload</span>
								<span>{uploadStatusLabel(state.status())}</span>
							</div>
							<div class="mt-3 flex justify-between gap-4 text-stone-400">
								<span>Authentication</span>
								<span>{session().data?.user ? "Signed in" : "Required"}</span>
							</div>
						</div>

						<Show when={state.error()}>
							{(message) => (
								<p class="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-red-300 text-sm">
									{message()}
								</p>
							)}
						</Show>

						<Show
							when={session().data?.user}
							fallback={
								<Show
									when={state.pendingAuth()}
									fallback={
										<div class="mt-6 space-y-4">
											<p class="text-sm text-stone-400">
												You can finish configuration before signing in. When you
												start processing, sign in here and this Source Document
												will be created automatically.
											</p>
											<button
												class="w-full rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
												disabled={
													state.status() !== "complete" || state.isStarting()
												}
												type="button"
												onClick={startProcessing}
											>
												{state.status() === "complete"
													? "Sign in to start processing"
													: "Uploading…"}
											</button>
										</div>
									}
								>
									<div class="mt-6 space-y-4">
										<p class="text-sm text-stone-400">
											Sign in or create an account. Processing will start once
											sign-in finishes.
										</p>
										<AuthPanel />
									</div>
								</Show>
							}
						>
							{(reader) => (
								<div class="mt-6 space-y-4">
									<div class="rounded-xl border border-stone-800 bg-stone-950 p-4">
										<p class="text-stone-400 text-sm">Signed in as</p>
										<p class="font-medium">{reader().email}</p>
									</div>
									<button
										class="w-full rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
										disabled={
											state.status() !== "complete" ||
											state.isStarting() ||
											!convexAuth.isAuthenticated()
										}
										type="button"
										onClick={startProcessing}
									>
										{state.isStarting()
											? "Starting processing…"
											: convexAuth.isAuthenticated()
												? "Start processing"
												: "Finishing sign-in…"}
									</button>
								</div>
							)}
						</Show>
					</aside>
				</section>
			)}
		</Show>
	);
}
