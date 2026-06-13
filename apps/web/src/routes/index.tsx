import { api } from "@academic-reader/convex/api";
import {
	sourceDocumentAcceptAttribute,
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypeForFile,
} from "@academic-reader/shared/uploads";
import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "convex-solidjs";
import { createSignal, For, Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { useConvexAuth } from "../providers/convex";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const sourceDocuments = useQuery(api.api.sourceDocuments.list, {}, () => ({
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
							Private research workbench
						</h1>
						<p class="mt-4 max-w-2xl text-stone-400">
							Import source documents, inspect processing evidence, and read
							clean readable views without hiding the conversion details.
						</p>
					</div>
					<AuthPanel />
				</header>

				<Show
					when={!session().isPending}
					fallback={
						<SectionCard
							title="Checking session"
							body="Preparing your workbench…"
						/>
					}
				>
					<Show when={session().data?.user} fallback={<SignedOutWorkbench />}>
						{(reader) => (
							<SignedInWorkbench
								readerName={reader().name || reader().email}
								documents={sourceDocuments.data()}
								error={sourceDocuments.error()}
							/>
						)}
					</Show>
				</Show>
			</div>
		</main>
	);
}

function AuthPanel() {
	const session = authClient.useSession();
	const [mode, setMode] = createSignal<"sign-in" | "sign-up">("sign-in");
	const [name, setName] = createSignal("");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string>();
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		setError(undefined);
		setIsSubmitting(true);

		const result =
			mode() === "sign-up"
				? await authClient.signUp.email({
						name: name() || email(),
						email: email(),
						password: password(),
					})
				: await authClient.signIn.email({
						email: email(),
						password: password(),
					});

		setIsSubmitting(false);

		if (result.error) {
			setError(result.error.message || "Authentication failed");
			return;
		}

		setPassword("");
	}

	async function signOut() {
		setError(undefined);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => window.location.reload(),
			},
		});
	}

	return (
		<section class="w-full rounded-2xl border border-stone-800 bg-stone-900/70 p-5 shadow-2xl md:w-96">
			<Show
				when={session().data?.user}
				fallback={
					<form class="flex flex-col gap-3" onSubmit={submit}>
						<div class="mb-1 flex rounded-full bg-stone-950 p-1 text-sm">
							<button
								class={tabClass(mode() === "sign-in")}
								type="button"
								onClick={() => setMode("sign-in")}
							>
								Sign in
							</button>
							<button
								class={tabClass(mode() === "sign-up")}
								type="button"
								onClick={() => setMode("sign-up")}
							>
								Create account
							</button>
						</div>

						<Show when={mode() === "sign-up"}>
							<label class="flex flex-col gap-1 text-sm text-stone-300">
								Name
								<input
									class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
									value={name()}
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							</label>
						</Show>

						<label class="flex flex-col gap-1 text-sm text-stone-300">
							Email
							<input
								class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
								required
								type="email"
								value={email()}
								onInput={(event) => setEmail(event.currentTarget.value)}
							/>
						</label>

						<label class="flex flex-col gap-1 text-sm text-stone-300">
							Password
							<input
								class="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
								required
								minLength={8}
								type="password"
								value={password()}
								onInput={(event) => setPassword(event.currentTarget.value)}
							/>
						</label>

						<Show when={error()}>
							{(message) => <p class="text-red-300 text-sm">{message()}</p>}
						</Show>

						<button
							class="rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-60"
							disabled={isSubmitting()}
							type="submit"
						>
							{isSubmitting()
								? "Working…"
								: mode() === "sign-up"
									? "Create account"
									: "Sign in"}
						</button>
					</form>
				}
			>
				{(reader) => (
					<div class="flex flex-col gap-4">
						<div>
							<p class="text-stone-400 text-sm">Signed in as</p>
							<p class="font-medium">{reader().email}</p>
						</div>
						<button
							class="rounded-lg border border-stone-700 px-4 py-2 text-stone-200 hover:bg-stone-800"
							type="button"
							onClick={signOut}
						>
							Sign out
						</button>
					</div>
				)}
			</Show>
		</section>
	);
}

function SignedOutWorkbench() {
	return (
		<div class="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
			<section class="rounded-3xl border border-dashed border-stone-700 bg-stone-900/40 p-8">
				<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
					Upload and configure
				</p>
				<h2 class="mt-4 text-3xl font-semibold">Bring a source document</h2>
				<p class="mt-3 max-w-2xl text-stone-400">
					Unauthenticated readers can start choosing a PDF or image and tune
					processing configuration before sign-in. Creating a Source Document
					will require authentication.
				</p>
				<div class="mt-8">
					<UploadAndConfigure />
				</div>
			</section>

			<SectionCard
				body="Sign in to create, process, read, and manage Source Documents."
				title="Authenticated workbench"
			/>
		</div>
	);
}

function SignedInWorkbench(props: {
	readerName: string;
	documents:
		| Array<{
				_id: string;
				filename: string;
				processingStatus: string;
				updatedAt: number;
		  }>
		| undefined;
	error: Error | undefined;
}) {
	return (
		<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
			<div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div>
					<p class="text-stone-400">Welcome, {props.readerName}</p>
					<h2 class="text-3xl font-semibold">Source Documents</h2>
				</div>
				<button
					class="rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950"
					type="button"
				>
					Add source document
				</button>
			</div>

			<Show
				when={!props.error}
				fallback={<p class="mt-8 text-red-300">{props.error?.message}</p>}
			>
				<Show
					when={props.documents !== undefined}
					fallback={
						<div class="mt-8 h-32 animate-pulse rounded-2xl bg-stone-800" />
					}
				>
					<Show
						when={props.documents && props.documents.length > 0}
						fallback={<EmptyLibrary />}
					>
						<div class="mt-8 divide-y divide-stone-800 rounded-2xl border border-stone-800">
							<For each={props.documents}>
								{(document) => (
									<div class="flex items-center justify-between gap-4 p-4">
										<div>
											<p class="font-medium">{document.filename}</p>
											<p class="text-stone-500 text-sm">
												Updated {new Date(document.updatedAt).toLocaleString()}
											</p>
										</div>
										<span class="rounded-full border border-stone-700 px-3 py-1 text-stone-400 text-xs">
											{document.processingStatus}
										</span>
									</div>
								)}
							</For>
						</div>
					</Show>
				</Show>
			</Show>
		</section>
	);
}

function EmptyLibrary() {
	return (
		<div class="mt-8 rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-10">
			<div class="text-center">
				<h3 class="text-xl font-semibold">No Source Documents yet</h3>
				<p class="mt-2 text-stone-500">
					Your library is ready. Temporary upload and Source Document creation
					are next.
				</p>
			</div>
			<div class="mt-8">
				<UploadAndConfigure />
			</div>
		</div>
	);
}

function UploadAndConfigure() {
	const [file, setFile] = createSignal<File>();
	const [status, setStatus] = createSignal<
		"idle" | "requesting" | "uploading" | "complete" | "error"
	>("idle");
	const [progress, setProgress] = createSignal(0);
	const [error, setError] = createSignal<string>();
	const [temporaryUploadId, setTemporaryUploadId] = createSignal<string>();

	async function selectFile(selectedFile: File | undefined) {
		if (!selectedFile) return;

		const mimeType = sourceDocumentMimeTypeForFile(
			selectedFile.name,
			selectedFile.type,
		);
		if (!mimeType) {
			setError("Choose a PDF, PNG, JPEG, WebP, or TIFF file.");
			setStatus("error");
			return;
		}
		if (selectedFile.size > sourceDocumentMaxSizeBytes) {
			setError("Source Documents must be 50MB or smaller.");
			setStatus("error");
			return;
		}

		setFile(selectedFile);
		setError(undefined);
		setTemporaryUploadId(undefined);
		setProgress(0);
		setStatus("requesting");

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

			setTemporaryUploadId(payload.temporaryUploadId);
			setStatus("uploading");
			await uploadFile(
				selectedFile,
				payload.uploadUrl,
				payload.headers,
				setProgress,
			);
			setProgress(100);
			setStatus("complete");
		} catch (uploadError) {
			setStatus("error");
			setError(
				uploadError instanceof Error ? uploadError.message : "Upload failed",
			);
		}
	}

	return (
		<div class="grid gap-4 md:grid-cols-[1fr_1fr]">
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

			<Show
				when={file()}
				fallback={
					<div class="rounded-2xl border border-stone-800 bg-stone-950 p-6 text-stone-500">
						Processing Configuration opens after file selection.
					</div>
				}
			>
				{(selectedFile) => (
					<section class="rounded-2xl border border-stone-800 bg-stone-950 p-6">
						<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
							Processing Configuration
						</p>
						<h3 class="mt-3 font-semibold text-xl">{selectedFile().name}</h3>
						<p class="mt-1 text-sm text-stone-500">
							{formatBytes(selectedFile().size)} · Marker conversion
						</p>

						<div class="mt-5 space-y-2">
							<div class="flex justify-between text-sm text-stone-400">
								<span>{uploadStatusLabel(status())}</span>
								<span>{Math.round(progress())}%</span>
							</div>
							<progress class="h-2 w-full" max="100" value={progress()} />
						</div>

						<Show when={temporaryUploadId()}>
							{(id) => (
								<p class="mt-3 break-all text-stone-600 text-xs">
									Temporary upload: {id()}
								</p>
							)}
						</Show>

						<Show when={error()}>
							{(message) => (
								<p class="mt-3 text-red-300 text-sm">{message()}</p>
							)}
						</Show>

						<button
							class="mt-5 w-full rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
							disabled={status() !== "complete"}
							type="button"
						>
							Start processing in next slice
						</button>
					</section>
				)}
			</Show>
		</div>
	);
}

function uploadFile(
	file: File,
	uploadUrl: string,
	headers: Record<string, string>,
	onProgress: (progress: number) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", uploadUrl);

		for (const [key, value] of Object.entries(headers)) {
			request.setRequestHeader(key, value);
		}

		request.upload.onprogress = (event) => {
			if (!event.lengthComputable) return;
			onProgress(Math.round((event.loaded / event.total) * 100));
		};
		request.onload = () => {
			if (request.status >= 200 && request.status < 300) {
				resolve();
				return;
			}
			reject(new Error(`Upload failed with status ${request.status}`));
		};
		request.onerror = () => reject(new Error("Upload failed"));
		request.send(file);
	});
}

function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function uploadStatusLabel(status: string) {
	if (status === "requesting") return "Preparing upload";
	if (status === "uploading") return "Uploading";
	if (status === "complete") return "Upload complete";
	if (status === "error") return "Upload failed";
	return "Waiting";
}

function SectionCard(props: { title: string; body: string }) {
	return (
		<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
			<h2 class="text-2xl font-semibold">{props.title}</h2>
			<p class="mt-3 text-stone-400">{props.body}</p>
		</section>
	);
}

function tabClass(isActive: boolean) {
	return `flex-1 rounded-full px-3 py-2 ${
		isActive ? "bg-stone-800 text-stone-50" : "text-stone-500"
	}`;
}
