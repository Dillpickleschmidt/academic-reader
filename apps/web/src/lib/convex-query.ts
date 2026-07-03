import type {
	FunctionArgs,
	FunctionReference,
	FunctionReturnType,
} from "convex/server";
import {
	batch,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
} from "solid-js";
import { useConvexClient } from "../providers/convex";

type MaybeAccessor<T> = T | (() => T);

interface QueryOptions {
	enabled?: boolean;
	keepPreviousData?: boolean;
}

/* Convex delivers query results by push subscription, so this binds
   client.onUpdate straight to signals. Unlike a createResource-based
   binding, reads never suspend a Suspense boundary (such as the one
   TanStack Router wraps around every route): data() is undefined until
   the first result arrives and the UI renders its own loading states. */
export function useQuery<Query extends FunctionReference<"query">>(
	query: Query,
	args: MaybeAccessor<FunctionArgs<Query>>,
	options?: MaybeAccessor<QueryOptions>,
) {
	const client = useConvexClient();
	const getArgs = createMemo(() => resolve(args));
	const getOptions = createMemo(() => resolve(options) ?? {});
	const [data, setData] = createSignal<FunctionReturnType<Query>>();
	const [error, setError] = createSignal<Error>();

	createEffect(
		on(
			[getArgs, () => getOptions().enabled !== false],
			([queryArgs, enabled]) => {
				if (!enabled) return;
				batch(() => {
					if (!getOptions().keepPreviousData) setData(undefined);
					setError(undefined);
				});

				const unsubscribe = client.onUpdate(
					query,
					queryArgs,
					(result) =>
						batch(() => {
							setData(() => result);
							setError(undefined);
						}),
					(queryError) =>
						batch(() => {
							setError(() => queryError);
							setData(undefined);
						}),
				);
				onCleanup(unsubscribe);
			},
		),
	);

	return { data, error };
}

function resolve<T>(value: MaybeAccessor<T> | undefined): T | undefined {
	return typeof value === "function" ? (value as () => T)() : value;
}
