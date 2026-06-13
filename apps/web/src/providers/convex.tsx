import { ConvexProvider, setupConvex } from "convex-solidjs";
import {
	createContext,
	createEffect,
	createMemo,
	createSignal,
	type JSX,
	onCleanup,
	useContext,
} from "solid-js";
import { authClient } from "../lib/auth-client";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
	throw new Error("VITE_CONVEX_URL is required");
}

const convexClient = setupConvex(convexUrl);
const ConvexAuthContext = createContext<{
	isAuthenticated: () => boolean;
	isLoading: () => boolean;
}>();

export function AppConvexProvider(props: { children: JSX.Element }) {
	const session = authClient.useSession();
	const [convexAuthenticated, setConvexAuthenticated] = createSignal(false);
	const sessionId = createMemo(() => session().data?.session.id ?? null);

	createEffect(() => {
		const currentSessionId = sessionId();

		if (session().isPending) return;

		if (!currentSessionId) {
			convexClient.setAuth(async () => null, setConvexAuthenticated);
			setConvexAuthenticated(false);
			return;
		}

		let pendingToken: Promise<string | null | undefined> | null = null;

		convexClient.setAuth(async ({ forceRefreshToken }) => {
			if (pendingToken && !forceRefreshToken) return pendingToken;

			pendingToken = authClient.convex
				.token({ fetchOptions: { throw: false } })
				.then(({ data }) => data?.token ?? null)
				.catch(() => null)
				.finally(() => {
					pendingToken = null;
				});

			return pendingToken;
		}, setConvexAuthenticated);
	});

	onCleanup(() => convexClient.close());

	const authState = {
		isAuthenticated: convexAuthenticated,
		isLoading: () => session().isPending,
	};

	return (
		<ConvexAuthContext.Provider value={authState}>
			<ConvexProvider client={convexClient}>{props.children}</ConvexProvider>
		</ConvexAuthContext.Provider>
	);
}

export function useConvexAuth() {
	const context = useContext(ConvexAuthContext);

	if (!context) {
		throw new Error("useConvexAuth must be used inside AppConvexProvider");
	}

	return context;
}
