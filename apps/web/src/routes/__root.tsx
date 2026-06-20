import { createRootRoute, Outlet } from "@tanstack/solid-router";

import { ThemeSettings } from "../features/theme/ThemeSettings";
import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<ThemeSettings />
			<Outlet />
		</>
	);
}
