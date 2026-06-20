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

type ColorTheme = (typeof COLOR_THEMES)[number]["id"];

const STORAGE_KEY = "color-theme";
const DEFAULT_THEME: ColorTheme = "default";

export function useColorTheme() {
	return [theme, setTheme] as const;
}

const validThemes = new Set<string>(COLOR_THEMES.map((t) => t.id));

function readStoredTheme(): ColorTheme {
	if (typeof window === "undefined") return DEFAULT_THEME;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && validThemes.has(saved)) return saved as ColorTheme;
	} catch {}
	return DEFAULT_THEME;
}

const { theme, setTheme } = createRoot(() => {
	const [value, setValue] = createSignal<ColorTheme>(readStoredTheme());
	createEffect(() => {
		const next = value();
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("data-color-theme", next);
		}
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {}
	});
	return { theme: value, setTheme: setValue };
});
