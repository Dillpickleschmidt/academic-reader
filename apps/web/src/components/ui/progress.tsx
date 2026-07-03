import { Progress as KobalteProgress } from "@kobalte/core/progress";
import type { Component, ComponentProps } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

export type ProgressProps = ComponentProps<typeof KobalteProgress> & {
	label?: string;
	showValue?: boolean;
	class?: string;
};

export const Progress: Component<ProgressProps> = (props) => {
	const [local, rest] = splitProps(props, ["class", "label", "showValue"]);

	return (
		<KobalteProgress
			class={cn("flex w-full flex-col gap-1.5", local.class)}
			{...rest}
		>
			<Show when={local.label || local.showValue}>
				<div class="flex items-center justify-between gap-3 text-dim text-xs">
					<Show when={local.label}>
						<KobalteProgress.Label class="truncate">
							{local.label}
						</KobalteProgress.Label>
					</Show>
					<Show when={local.showValue}>
						<KobalteProgress.ValueLabel class="ml-auto shrink-0 tabular-nums" />
					</Show>
				</div>
			</Show>
			<KobalteProgress.Track class="relative h-0.5 w-full overflow-hidden rounded-full bg-border">
				<KobalteProgress.Fill class="h-full w-(--kb-progress-fill-width) bg-primary transition-all data-[indeterminate]:w-full data-[indeterminate]:animate-pulse data-[indeterminate]:bg-primary/60" />
			</KobalteProgress.Track>
		</KobalteProgress>
	);
};
