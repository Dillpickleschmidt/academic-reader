import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import X from "lucide-solid/icons/x";
import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const Dialog = KobalteDialog;

const DialogOverlay: Component<ComponentProps<typeof KobalteDialog.Overlay>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobalteDialog.Overlay
			class={cn("fixed inset-0 z-50 bg-black/40", local.class)}
			{...rest}
		/>
	);
};

const DialogContent: Component<ComponentProps<typeof KobalteDialog.Content>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<KobalteDialog.Portal>
			<DialogOverlay />
			<KobalteDialog.Content
				class={cn(
					"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]",
					"gap-4 border border-border bg-popover p-6 text-popover-foreground shadow-overlay sm:rounded-md",
					local.class,
				)}
				{...rest}
			>
				{local.children}
				<KobalteDialog.CloseButton
					class={cn(
						buttonVariants({ variant: "ghost", size: "icon-sm" }),
						"absolute top-4 right-4",
					)}
				>
					<X class="size-4" />
					<span class="sr-only">Close</span>
				</KobalteDialog.CloseButton>
			</KobalteDialog.Content>
		</KobalteDialog.Portal>
	);
};

const DialogTitle: Component<ComponentProps<typeof KobalteDialog.Title>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobalteDialog.Title
			class={cn(
				"text-lg font-semibold leading-none tracking-tight",
				local.class,
			)}
			{...rest}
		/>
	);
};

export { Dialog, DialogContent, DialogTitle };
