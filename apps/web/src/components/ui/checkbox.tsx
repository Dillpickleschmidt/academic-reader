import { Checkbox as KobalteCheckbox } from "@kobalte/core/checkbox";
import Check from "lucide-solid/icons/check";
import type { Component, ComponentProps } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

export type CheckboxProps = ComponentProps<typeof KobalteCheckbox> & {
	label?: string;
	description?: string;
	class?: string;
};

export const Checkbox: Component<CheckboxProps> = (props) => {
	const [local, rest] = splitProps(props, ["class", "label", "description"]);

	return (
		<KobalteCheckbox
			class={cn("flex items-start justify-between gap-4", local.class)}
			{...rest}
		>
			<KobalteCheckbox.Input class="peer sr-only" />
			<Show when={local.label || local.description}>
				<div class="flex min-w-0 flex-col gap-0.5">
					<Show when={local.label}>
						<KobalteCheckbox.Label class="text-foreground text-sm data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70">
							{local.label}
						</KobalteCheckbox.Label>
					</Show>
					<Show when={local.description}>
						<KobalteCheckbox.Description class="text-dim text-xs">
							{local.description}
						</KobalteCheckbox.Description>
					</Show>
				</div>
			</Show>
			<KobalteCheckbox.Control
				class={cn(
					"flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border border-input transition-colors",
					"ring-offset-background peer-focus-visible:outline-none peer-focus-visible:ring-2",
					"peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
					"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
					"data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
				)}
			>
				<KobalteCheckbox.Indicator class="flex items-center justify-center text-current">
					<Check class="size-3.5" />
				</KobalteCheckbox.Indicator>
			</KobalteCheckbox.Control>
		</KobalteCheckbox>
	);
};
