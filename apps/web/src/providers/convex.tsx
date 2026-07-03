import { ConvexClient } from "convex/browser";
import {
	createContext,
	createEffect,
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

const ConvexClientContext = createContext<ConvexClient>();

const ConvexAuthContext = createContext<{
	isAuthenticated: () => boolean;
	isLoading: () => boolean;
}>();

export function AppConvexProvider(props: { children: JSX.Element }) {
	const convexClient = new ConvexClient(convexUrl);
	onCleanup(() => convexClient.close());
	const session = authClient.useSession();
	const [convexAuthenticated, setConvexAuthenticated] = createSignal(false);

	createEffect(() => {
		const currentSessionId = session().data?.session.id ?? null;

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

	const authState = {
		isAuthenticated: convexAuthenticated,
		isLoading: () => session().isPending,
	};

	return (
		<ConvexAuthContext.Provider value={authState}>
			<ConvexClientContext.Provider value={convexClient}>
				{props.children}
			</ConvexClientContext.Provider>
		</ConvexAuthContext.Provider>
	);
}

export function useConvexClient(): ConvexClient {
	const client = useContext(ConvexClientContext);

	if (!client) {
		throw new Error("useConvexClient must be used inside AppConvexProvider");
	}

	return client;
}

export function useConvexAuth() {
	const context = useContext(ConvexAuthContext);

	if (!context) {
		throw new Error("useConvexAuth must be used inside AppConvexProvider");
	}

	return context;
}
