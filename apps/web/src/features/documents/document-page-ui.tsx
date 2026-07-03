import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function EmptyPane(props: { title: string; body: string | undefined }) {
	return (
		<div class="m-8 rounded-md border border-border bg-card p-8 text-center">
			<h3 class="font-semibold text-xl">{props.title}</h3>
			<p class="mt-2 text-muted-foreground">{props.body}</p>
		</div>
	);
}

export function RetryMessage(props: {
	title: string;
	body: string;
	onRetry: () => void;
}) {
	return (
		<div class="m-8 rounded-md border border-border bg-card p-8 text-center">
			<h3 class="font-semibold text-xl">{props.title}</h3>
			<p class="mt-2 text-muted-foreground">{props.body}</p>
			<button
				class={cn(buttonVariants(), "mt-5")}
				type="button"
				onClick={props.onRetry}
			>
				Retry
			</button>
		</div>
	);
}

export function FullPageMessage(props: { title: string; body: string }) {
	return (
		<section class="m-auto w-full max-w-3xl rounded-md border border-border bg-card p-8">
			<h1 class="font-semibold text-2xl">{props.title}</h1>
			<p class="mt-3 text-muted-foreground">{props.body}</p>
		</section>
	);
}

export function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: String(error || "Unknown error");
}
