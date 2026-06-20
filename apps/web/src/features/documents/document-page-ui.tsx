export function PaneSkeleton() {
	return (
		<div class="space-y-4">
			<div class="h-64 animate-pulse rounded-2xl bg-muted" />
			<div class="h-64 animate-pulse rounded-2xl bg-muted/70" />
		</div>
	);
}

export function EmptyPane(props: { title: string; body: string | undefined }) {
	return (
		<div class="m-8 rounded-2xl border border-border bg-card/50 p-8 text-center">
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
		<div class="m-8 rounded-2xl border border-border bg-card/50 p-8 text-center">
			<h3 class="font-semibold text-xl">{props.title}</h3>
			<p class="mt-2 text-muted-foreground">{props.body}</p>
			<button
				class="mt-5 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
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
		<section class="m-auto w-full max-w-3xl rounded-3xl border border-border bg-card/50 p-8">
			<h1 class="text-2xl font-semibold">{props.title}</h1>
			<p class="mt-3 text-muted-foreground">{props.body}</p>
		</section>
	);
}

export function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: String(error || "Unknown error");
}
