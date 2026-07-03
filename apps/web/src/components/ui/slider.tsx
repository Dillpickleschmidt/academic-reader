import { Slider as KobalteSlider } from "@kobalte/core/slider";
import type { Component, ComponentProps } from "solid-js";
import { For, Show, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

export type SliderProps = ComponentProps<typeof KobalteSlider> & {
	label?: string;
	class?: string;
};

export const Slider: Component<SliderProps> = (props) => {
	const [local, rest] = splitProps(props, ["class", "label", "defaultValue"]);
	const values = () => (rest.value ?? local.defaultValue ?? [0]) as number[];

	return (
		<KobalteSlider
			class={cn(
				"relative flex w-full touch-none select-none flex-col items-center gap-2",
				local.class,
			)}
			{...(local.defaultValue !== undefined
				? { defaultValue: local.defaultValue }
				: {})}
			{...rest}
		>
			<Show when={local.label}>
				<div class="flex w-full justify-between">
					<KobalteSlider.Label class="font-medium text-sm leading-none">
						{local.label}
					</KobalteSlider.Label>
					<KobalteSlider.ValueLabel class="text-muted-foreground text-sm" />
				</div>
			</Show>
			<KobalteSlider.Track class="relative h-1 w-full grow rounded-full bg-border">
				<KobalteSlider.Fill class="absolute h-full rounded-full bg-primary" />
				<For each={values()}>
					{() => (
						<KobalteSlider.Thumb
							class={cn(
								"-top-1 block size-3 rounded-full border border-primary bg-background ring-offset-background",
								"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
						>
							<KobalteSlider.Input />
						</KobalteSlider.Thumb>
					)}
				</For>
			</KobalteSlider.Track>
		</KobalteSlider>
	);
};
