import { createRouter } from "@tanstack/solid-router";
import { AppConvexProvider } from "./providers/convex";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		Wrap: (props) => <AppConvexProvider>{props.children}</AppConvexProvider>,
	});
}

declare module "@tanstack/solid-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
