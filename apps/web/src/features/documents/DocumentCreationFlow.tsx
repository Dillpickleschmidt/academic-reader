import { api } from "@academic-reader/convex/api";
import { narrationVoices } from "@academic-reader/shared/processing";
import { sourceDocumentAcceptAttribute } from "@academic-reader/shared/uploads";
import { createEffect, createSignal, Show } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { authClient } from "../../lib/auth-client";
import { useQuery } from "../../lib/convex-query";
import { fetchJson } from "../../lib/fetch-json";
import { useConvexAuth, useConvexClient } from "../../providers/convex";
import { AuthPanel } from "../auth/AuthPanel";
import {
	clearDocumentDraft,
	type DocumentCreation,
	selectSourceDocument,
	uploadStatusLabel,
} from "./document-creation";

const conversionModels = [{ id: "marker", label: "Marker" }];

export function UploadPrompt(props: { state: DocumentCreation }) {
	const state = props.state;

	return (
		<div>
			<label class="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border p-6 text-center transition-colors hover:border-primary hover:bg-primary/5">
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
		<label class={cn(buttonVariants(), "cursor-pointer")}>
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
	const convexClient = useConvexClient();
	const preferences = useQuery(
		api.api.configurationPreferences.get,
		{},
		() => ({
			enabled: convexAuth.isAuthenticated(),
		}),
	);
	const codexConnection = useQuery(
		api.api.codexConnections.getStatus,
		{},
		() => ({
			enabled: convexAuth.isAuthenticated(),
		}),
	);
	const [codexConnecting, setCodexConnecting] = createSignal(false);
	const [codexDisconnecting, setCodexDisconnecting] = createSignal(false);
	const [codexDeviceCode, setCodexDeviceCode] = createSignal<CodexDeviceCode>();
	const [codexError, setCodexError] = createSignal<string>();
	const state = props.state;

	createEffect(() => {
		const savedPreferences = preferences.data();
		if (!savedPreferences || state.preferenceTouched()) return;

		state.setConversionModel(savedPreferences.conversionModel);
		state.setForceOcr(savedPreferences.markerForceOcr);
		state.setUseLlm(savedPreferences.markerUseLlm);
		state.setNarrationEnabled(savedPreferences.narrationEnabled);
		state.setEquationExplanationsEnabled(
			savedPreferences.equationExplanationsEnabled,
		);
		state.setNarrationVoice(savedPreferences.narrationVoice);
	});

	createEffect(() => {
		const status = codexConnection.data();
		if (!status || status.connected) return;
		state.setEquationExplanationsEnabled(false);
	});

	createEffect(() => {
		if (!state.pendingAuth()) return;
		if (!session().data?.user || !convexAuth.isAuthenticated()) return;
		if (state.status() !== "complete" || state.isStarting()) return;

		void startProcessing();
	});

	function codexConnected() {
		return codexConnection.data()?.connected === true;
	}

	function missingRequiredCodexConnection() {
		return state.equationExplanationsEnabled() && !codexConnected();
	}

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
		if (missingRequiredCodexConnection()) {
			state.setError("Connect Codex before generating Equation Explanations.");
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
							equationExplanations: {
								enabled: state.equationExplanationsEnabled(),
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

	async function disconnectCodexConnection() {
		setCodexDisconnecting(true);
		setCodexError(undefined);

		try {
			await convexClient.mutation(api.api.codexConnections.disconnect, {});
			state.setEquationExplanationsEnabled(false);
		} catch (error) {
			setCodexError(
				error instanceof Error ? error.message : "Could not disconnect Codex",
			);
		} finally {
			setCodexDisconnecting(false);
		}
	}

	async function connectCodexConnection() {
		setCodexConnecting(true);
		setCodexDeviceCode(undefined);
		setCodexError(undefined);

		try {
			await connectCodex((event) => {
				if (event.type === "device_code") setCodexDeviceCode(event.info);
			});
		} catch (error) {
			setCodexError(
				error instanceof Error ? error.message : "Could not connect Codex",
			);
		} finally {
			setCodexConnecting(false);
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
						<p class="font-medium text-muted-foreground text-xs">
							Configure run
						</p>
						<h2 class="mt-2 truncate font-semibold text-xl tracking-tight">
							{selectedFile().name}
						</h2>
					</header>

					<div class="grid gap-8 border-border border-t pt-6 md:grid-cols-[minmax(0,1fr)_240px]">
						<div class="flex flex-col gap-6">
							<section>
								<p class="font-medium text-muted-foreground text-xs">
									Conversion
								</p>
								<div class="mt-4 flex flex-col gap-4">
									<div class="flex items-center justify-between gap-4">
										<span class="text-foreground text-sm">Model</span>
										<Select
											options={conversionModels}
											optionValue="id"
											optionTextValue="label"
											value={conversionModels.find(
												(model) => model.id === state.conversionModel(),
											)}
											onChange={(option) => {
												if (!option) return;
												updatePreference(() =>
													state.setConversionModel(option.id),
												);
											}}
											itemComponent={(itemProps) => (
												<SelectItem item={itemProps.item}>
													{itemProps.item.rawValue.label}
												</SelectItem>
											)}
										>
											<SelectTrigger
												aria-label="Conversion Model"
												class="w-48"
											/>
											<SelectContent />
										</Select>
									</div>

									<div class="flex items-center justify-between gap-4">
										<span class="text-foreground text-sm">
											Page range <span class="text-dim">optional</span>
										</span>
										<Input
											class="w-48"
											placeholder="e.g. 1-5, 10, 15-20"
											value={state.pageRange()}
											onInput={(event) =>
												state.setPageRange(event.currentTarget.value)
											}
										/>
									</div>

									<Checkbox
										checked={state.forceOcr()}
										description="Re-OCR pages even when extractable text exists."
										label="Force OCR"
										onChange={(checked) =>
											updatePreference(() => state.setForceOcr(checked))
										}
									/>

									<Checkbox
										checked={state.useLlm()}
										description="Use Marker LLM-assisted detection when available."
										label="Enhanced detection"
										onChange={(checked) =>
											updatePreference(() => state.setUseLlm(checked))
										}
									/>
								</div>
							</section>

							<section class="border-border border-t pt-6">
								<p class="font-medium text-muted-foreground text-xs">
									Equation Explanations
								</p>
								<div class="mt-4 flex flex-col gap-4">
									<Checkbox
										checked={state.equationExplanationsEnabled()}
										description={
											codexConnected()
												? "Generate collapsible explanations for standalone equations using your Codex subscription."
												: "Connect Codex before enabling Equation Explanations."
										}
										disabled={!codexConnected()}
										label="Generate Equation Explanations"
										onChange={(checked) =>
											updatePreference(() =>
												state.setEquationExplanationsEnabled(checked),
											)
										}
									/>

									<Show
										when={codexConnected()}
										fallback={
											<div class="rounded-sm border border-border p-3 text-sm">
												<p class="text-muted-foreground">
													Equation Explanations use a Codex Connection tied to
													your Codex subscription.
												</p>
												<button
													class={cn(
														buttonVariants({ variant: "outline", size: "sm" }),
														"mt-3",
													)}
													disabled={
														codexConnecting() || !convexAuth.isAuthenticated()
													}
													type="button"
													onClick={() => void connectCodexConnection()}
												>
													{codexConnecting()
														? "Waiting for Codex…"
														: "Connect Codex"}
												</button>
												<Show when={codexDeviceCode()}>
													{(device) => (
														<div class="mt-3 text-xs">
															<p class="text-muted-foreground">
																Open this page and enter the code:
															</p>
															<a
																class="break-all text-primary hover:underline"
																href={device().verificationUri}
																target="_blank"
																rel="noreferrer"
															>
																{device().verificationUri}
															</a>
															<p class="mt-2 font-mono text-foreground text-lg tracking-widest">
																{device().userCode}
															</p>
														</div>
													)}
												</Show>
												<Show when={codexError()}>
													{(message) => (
														<p class="mt-3 text-destructive text-xs">
															{message()}
														</p>
													)}
												</Show>
											</div>
										}
									>
										<div class="flex items-center justify-between gap-3 text-sm">
											<p class="text-muted-foreground">Codex connected.</p>
											<button
												class={buttonVariants({
													variant: "outline",
													size: "sm",
												})}
												disabled={codexDisconnecting()}
												type="button"
												onClick={() => void disconnectCodexConnection()}
											>
												{codexDisconnecting() ? "Disconnecting…" : "Disconnect"}
											</button>
										</div>
										<Show when={codexError()}>
											{(message) => (
												<p class="mt-3 text-destructive text-xs">{message()}</p>
											)}
										</Show>
									</Show>
								</div>
							</section>

							<section class="border-border border-t pt-6">
								<p class="font-medium text-muted-foreground text-xs">
									Narration
								</p>
								<div class="mt-4 flex flex-col gap-4">
									<Checkbox
										checked={state.narrationEnabled()}
										description="Create spoken audio once the Reader View is ready."
										label="Generate narration"
										onChange={(checked) =>
											updatePreference(() => state.setNarrationEnabled(checked))
										}
									/>

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
										<Select
											disabled={!state.narrationEnabled()}
											options={[...narrationVoices]}
											optionValue="id"
											optionTextValue="label"
											value={narrationVoices.find(
												(voice) => voice.id === state.narrationVoice(),
											)}
											onChange={(option) => {
												if (!option) return;
												updatePreference(() =>
													state.setNarrationVoice(option.id),
												);
											}}
											itemComponent={(itemProps) => (
												<SelectItem item={itemProps.item}>
													{itemProps.item.rawValue.label}
												</SelectItem>
											)}
										>
											<SelectTrigger
												aria-label="Narration Voice"
												class="w-48"
											/>
											<SelectContent />
										</Select>
									</div>
								</div>
							</section>
						</div>

						<aside class="flex flex-col gap-4 border-border border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
							<p class="font-medium text-muted-foreground text-xs">Create</p>

							<Show
								when={
									state.status() !== "idle" && state.status() !== "complete"
								}
							>
								<Progress
									getValueLabel={({ value }) => `${Math.round(value)}%`}
									label={uploadStatusLabel(state.status())}
									maxValue={100}
									showValue
									value={state.progress()}
								/>
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
											class={buttonVariants()}
											disabled={state.status() !== "complete"}
											type="button"
											onClick={startProcessing}
										>
											{state.status() === "complete"
												? "Sign in to start"
												: "Uploading…"}
										</button>
										<button
											class={buttonVariants({ variant: "outline" })}
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
											<p class="text-dim text-xs">Signed in as</p>
											<p class="truncate text-foreground text-sm">
												{reader().email}
											</p>
										</div>
										<div class="flex flex-col gap-2">
											<button
												class={buttonVariants()}
												disabled={
													state.status() !== "complete" ||
													state.isStarting() ||
													!convexAuth.isAuthenticated() ||
													missingRequiredCodexConnection()
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
												class={buttonVariants({ variant: "outline" })}
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

interface CodexDeviceCode {
	userCode: string;
	verificationUri: string;
	intervalSeconds?: number;
	expiresInSeconds?: number;
}

type CodexConnectionEvent = { type: "device_code"; info: CodexDeviceCode };

async function connectCodex(onEvent: (event: CodexConnectionEvent) => void) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Codex Connection");

	const response = await fetch("/api/codex-connections/connect", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok || !response.body) {
		throw new Error("Could not start Codex Connection");
	}

	await readSseEvents(response, (event) => {
		if (event.event === "device_code") {
			onEvent({
				type: "device_code",
				info: JSON.parse(event.data) as CodexDeviceCode,
			});
		}
		if (event.event === "connection_error") {
			const parsed = JSON.parse(event.data) as { error?: string };
			throw new Error(parsed.error ?? "Could not connect Codex");
		}
	});
}

async function readSseEvents(
	response: Response,
	onEvent: (event: { event: string; data: string }) => void,
) {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Codex Connection response was empty");

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let boundary = buffer.indexOf("\n\n");
		while (boundary >= 0) {
			const chunk = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const event = parseSseEvent(chunk);
			if (event) onEvent(event);
			boundary = buffer.indexOf("\n\n");
		}
	}
}

function parseSseEvent(chunk: string) {
	let event = "message";
	const data: string[] = [];

	for (const line of chunk.split("\n")) {
		if (line.startsWith("event:")) event = line.slice(6).trim();
		if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
	}

	if (!data.length) return undefined;
	return { event, data: data.join("\n") };
}
