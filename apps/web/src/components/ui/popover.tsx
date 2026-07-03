import { Popover as KobaltePopover } from "@kobalte/core/popover";
import X from "lucide-solid/icons/x";
import type { Component, ComponentProps, JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const Popover = KobaltePopover;
const PopoverTrigger = KobaltePopover.Trigger;
const PopoverAnchor = KobaltePopover.Anchor;

const PopoverContent: Component<
	ComponentProps<typeof KobaltePopover.Content> & { showClose?: boolean }
> = (props) => {
	const [local, rest] = splitProps(props, ["class", "showClose", "children"]);
	return (
		<KobaltePopover.Portal>
			<KobaltePopover.Content
				class={cn(
					"z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-overlay outline-none",
					local.class,
				)}
				{...rest}
			>
				<Show when={local.showClose !== false}>
					<KobaltePopover.CloseButton
						class={cn(
							buttonVariants({ variant: "ghost", size: "icon-sm" }),
							"absolute top-4 right-4",
						)}
					>
						<X class="size-4" />
						<span class="sr-only">Close</span>
					</KobaltePopover.CloseButton>
				</Show>
				{local.children as JSX.Element}
			</KobaltePopover.Content>
		</KobaltePopover.Portal>
	);
};

const PopoverTitle: Component<ComponentProps<typeof KobaltePopover.Title>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobaltePopover.Title
			class={cn("font-semibold text-sm", local.class)}
			{...rest}
		/>
	);
};

const PopoverDescription: Component<
	ComponentProps<typeof KobaltePopover.Description>
> = (props) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobaltePopover.Description
			class={cn("text-muted-foreground text-sm", local.class)}
			{...rest}
		/>
	);
};

export {
	Popover,
	PopoverTrigger,
	PopoverAnchor,
	PopoverContent,
	PopoverTitle,
	PopoverDescription,
};
