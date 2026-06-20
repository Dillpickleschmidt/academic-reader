import Check from "lucide-solid/icons/check";
import Settings from "lucide-solid/icons/settings";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { COLOR_THEMES, useColorTheme } from "./color-theme";

export function ThemeSettings() {
	const [theme, setTheme] = useColorTheme();
	const [open, setOpen] = createSignal(false);
	let root: HTMLDivElement | undefined;

	onMount(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		onCleanup(() => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		});
	});

	return (
		<div class="fixed top-4 right-4 z-50" ref={root}>
			<button
				type="button"
				aria-label="Settings"
				aria-expanded={open()}
				onClick={() => setOpen((v) => !v)}
				class="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
			>
				<Settings class="size-4" />
			</button>

			<Show when={open()}>
				<div class="absolute top-11 right-0 w-60 rounded-xl border border-border bg-card p-2 shadow-xl shadow-black/40">
					<p class="px-2 pt-1 pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Theme
					</p>
					<For each={COLOR_THEMES}>
						{(option) => (
							<button
								type="button"
								onClick={() => setTheme(option.id)}
								class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-foreground text-sm transition-colors hover:bg-muted"
							>
								<span class="flex shrink-0 overflow-hidden rounded-full border border-border">
									<For each={option.swatch}>
										{(color) => (
											<span
												class="size-4"
												style={{ "background-color": color }}
											/>
										)}
									</For>
								</span>
								<span class="flex-1">{option.name}</span>
								<Show when={theme() === option.id}>
									<Check class="size-4 text-primary" />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
