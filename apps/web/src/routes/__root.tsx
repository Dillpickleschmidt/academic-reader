import { createRootRoute, Outlet } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { AppConvexProvider } from "../providers/convex";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<AppConvexProvider>
			<Outlet />
			<TanStackRouterDevtools position="bottom-right" />
		</AppConvexProvider>
	);
}
