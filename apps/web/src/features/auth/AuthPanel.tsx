import { createSignal, Show } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "~/components/ui/segmented";
import { cn } from "~/lib/utils";
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
		<section class="w-full rounded-md border border-border bg-card p-5 md:w-96">
			<Show
				when={session().data?.user}
				fallback={
					<form class="flex flex-col gap-3" onSubmit={submit}>
						<div class={cn(segmentedGroupClass, "mb-1 grid-cols-2 text-sm")}>
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
							<div class="flex flex-col gap-1.5">
								<Label for="auth-name">Name</Label>
								<Input
									id="auth-name"
									value={name()}
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							</div>
						</Show>

						<div class="flex flex-col gap-1.5">
							<Label for="auth-email">Email</Label>
							<Input
								id="auth-email"
								required
								type="email"
								value={email()}
								onInput={(event) => setEmail(event.currentTarget.value)}
							/>
						</div>

						<div class="flex flex-col gap-1.5">
							<Label for="auth-password">Password</Label>
							<Input
								id="auth-password"
								required
								minLength={8}
								type="password"
								value={password()}
								onInput={(event) => setPassword(event.currentTarget.value)}
							/>
						</div>

						<Show when={error()}>
							{(message) => <p class="text-destructive text-sm">{message()}</p>}
						</Show>

						<button
							class={buttonVariants()}
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
							<p class="text-muted-foreground text-sm">Signed in as</p>
							<p class="font-medium">{reader().email}</p>
						</div>
						<button
							class={buttonVariants({ variant: "outline" })}
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
	return cn(segmentedItemClass(isActive), "px-3 py-1.5");
}
