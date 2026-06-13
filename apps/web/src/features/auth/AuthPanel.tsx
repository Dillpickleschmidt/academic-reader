import { createSignal, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";

export function AuthPanel() {
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

function tabClass(isActive: boolean) {
	return `flex-1 rounded-full px-3 py-2 ${
		isActive ? "bg-stone-800 text-stone-50" : "text-stone-500"
	}`;
}
