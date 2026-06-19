import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { getRouter } from "./router";

const router = getRouter();

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	render(() => <RouterProvider router={router} />, rootElement);
}
