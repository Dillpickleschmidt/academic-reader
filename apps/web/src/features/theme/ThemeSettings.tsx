import Check from "lucide-solid/icons/check";
import Settings from "lucide-solid/icons/settings";
import { For, Show } from "solid-js";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "~/components/ui/segmented";
import { cn } from "~/lib/utils";
import {
	COLOR_MODES,
	COLOR_THEMES,
	useColorMode,
	useColorTheme,
} from "./color-theme";

export function ThemeSettings() {
	const [theme, setTheme] = useColorTheme();
	const { mode, setMode, resolvedMode } = useColorMode();
	const lightActive = () => resolvedMode() === "light";

	return (
		<div class="fixed top-4 right-4 z-50">
			<Popover gutter={8} placement="bottom-end">
				<PopoverTrigger
					aria-label="Appearance settings"
					class="flex size-9 items-center justify-center rounded-sm border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<Settings class="size-4" />
				</PopoverTrigger>
				<PopoverContent class="w-64 p-2" showClose={false}>
					<p class="px-2 pt-1 pb-2 font-medium text-muted-foreground text-xs">
						Mode
					</p>
					<div class={cn(segmentedGroupClass, "mx-2 grid-cols-3")}>
						<For each={COLOR_MODES}>
							{(option) => (
								<button
									type="button"
									onClick={() => setMode(option.id)}
									class={cn(
										segmentedItemClass(mode() === option.id),
										"py-1 text-sm",
									)}
								>
									{option.name}
								</button>
							)}
						</For>
					</div>

					<p class="px-2 pt-4 pb-2 font-medium text-muted-foreground text-xs">
						Theme
					</p>
					<For each={COLOR_THEMES}>
						{(option) => (
							<button
								type="button"
								disabled={lightActive()}
								onClick={() => setTheme(option.id)}
								class="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-foreground text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
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
								<Show when={theme() === option.id && !lightActive()}>
									<Check class="size-4 text-primary" />
								</Show>
							</button>
						)}
					</For>
					<Show when={lightActive()}>
						<p class="px-2 pt-1 pb-1 text-dim text-xs">
							Themes apply in dark mode.
						</p>
					</Show>
				</PopoverContent>
			</Popover>
		</div>
	);
}
