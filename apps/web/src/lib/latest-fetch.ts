import {
	batch,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
} from "solid-js";

/* A fetch keyed by a reactive source, exposed as plain signals so reads
   never suspend a Suspense boundary (unlike createResource). The fetch
   runs whenever the source is defined; only the latest request commits. */
export function createLatestFetch<Source, Value>(
	source: () => Source | undefined,
	fetcher: (source: Source) => Promise<Value>,
) {
	const currentSource = createMemo(source);
	const [data, setData] = createSignal<Value>();
	const [error, setError] = createSignal<unknown>();
	const [loading, setLoading] = createSignal(false);
	const [attempt, setAttempt] = createSignal(0);

	createEffect(
		on([currentSource, attempt], ([sourceValue]) => {
			if (sourceValue === undefined) return;

			let stale = false;
			batch(() => {
				setLoading(true);
				setError(undefined);
			});

			fetcher(sourceValue)
				.then((value) => {
					if (stale) return;
					batch(() => {
						setData(() => value);
						setLoading(false);
					});
				})
				.catch((fetchError) => {
					if (stale) return;
					batch(() => {
						setError(() => fetchError);
						setData(undefined);
						setLoading(false);
					});
				});

			onCleanup(() => {
				stale = true;
			});
		}),
	);

	return { data, error, loading, refetch: () => setAttempt((n) => n + 1) };
}
