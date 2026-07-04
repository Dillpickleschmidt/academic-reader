import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import type { Component, ComponentProps } from "solid-js";
import { mergeProps, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

const Tooltip: Component<ComponentProps<typeof KobalteTooltip>> = (props) => {
	const merged = mergeProps({ gutter: 4, openDelay: 300 }, props);
	return <KobalteTooltip {...merged} />;
};

const TooltipTrigger = KobalteTooltip.Trigger;

const TooltipContent: Component<
	ComponentProps<typeof KobalteTooltip.Content>
> = (props) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobalteTooltip.Portal>
			<KobalteTooltip.Content
				class={cn(
					"z-50 rounded-sm border border-border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-overlay",
					local.class,
				)}
				{...rest}
			/>
		</KobalteTooltip.Portal>
	);
};

export { Tooltip, TooltipTrigger, TooltipContent };
