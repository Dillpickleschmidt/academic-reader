import { createEffect, createRoot, createSignal } from "solid-js";

export const COLOR_THEMES = [
	{
		id: "default",
		name: "Default",
		swatch: ["oklch(0.145 0 0)", "#7c9a6e", "oklch(0.708 0 0)"],
	},
	{
		id: "tokyo-night",
		name: "Tokyo Night",
		swatch: ["#1a1b26", "#7aa2f7", "#bb9af7"],
	},
	{
		id: "catppuccin",
		name: "Catppuccin",
		swatch: ["#1e1e2e", "#cba6f7", "#94e2d5"],
	},
	{ id: "nord", name: "Nord", swatch: ["#2e3440", "#8fbcbb", "#88c0d0"] },
	{
		id: "rose-pine",
		name: "Rosé Pine",
		swatch: ["#191724", "#ebbcba", "#9ccfd8"],
	},
] as const;

export const COLOR_MODES = [
	{ id: "auto", name: "Auto" },
	{ id: "light", name: "Light" },
	{ id: "dark", name: "Dark" },
] as const;

type ColorTheme = (typeof COLOR_THEMES)[number]["id"];
export type ColorMode = (typeof COLOR_MODES)[number]["id"];
export type ResolvedColorMode = "light" | "dark";

const THEME_STORAGE_KEY = "color-theme";
const MODE_STORAGE_KEY = "color-mode";
const DEFAULT_THEME: ColorTheme = "default";
const DEFAULT_MODE: ColorMode = "auto";

export function useColorTheme() {
	return [theme, setTheme] as const;
}

export function useColorMode() {
	return { mode, setMode, resolvedMode } as const;
}

const validThemes = new Set<string>(COLOR_THEMES.map((t) => t.id));

function readStoredTheme(): ColorTheme {
	if (typeof window === "undefined") return DEFAULT_THEME;
	try {
		const saved = localStorage.getItem(THEME_STORAGE_KEY);
		if (saved && validThemes.has(saved)) return saved as ColorTheme;
	} catch {}
	return DEFAULT_THEME;
}

function readStoredMode(): ColorMode {
	if (typeof window === "undefined") return DEFAULT_MODE;
	try {
		const saved = localStorage.getItem(MODE_STORAGE_KEY);
		if (saved === "light" || saved === "dark") return saved;
	} catch {}
	return DEFAULT_MODE;
}

const { theme, setTheme, mode, setMode, resolvedMode } = createRoot(() => {
	const [theme, setTheme] = createSignal<ColorTheme>(readStoredTheme());
	const [mode, setMode] = createSignal<ColorMode>(readStoredMode());
	const [prefersLight, setPrefersLight] = createSignal(
		typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: light)").matches,
	);

	if (typeof window !== "undefined") {
		window
			.matchMedia("(prefers-color-scheme: light)")
			.addEventListener("change", (event) => setPrefersLight(event.matches));
	}

	const resolvedMode = (): ResolvedColorMode => {
		const current = mode();
		if (current !== "auto") return current;
		return prefersLight() ? "light" : "dark";
	};

	createEffect(() => {
		const next = theme();
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("data-color-theme", next);
		}
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {}
	});

	createEffect(() => {
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("data-mode", resolvedMode());
		}
		try {
			localStorage.setItem(MODE_STORAGE_KEY, mode());
		} catch {}
	});

	return { theme, setTheme, mode, setMode, resolvedMode };
});
