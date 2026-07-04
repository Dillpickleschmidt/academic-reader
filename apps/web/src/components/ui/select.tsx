import { Select as KobalteSelect } from "@kobalte/core/select";
import Check from "lucide-solid/icons/check";
import ChevronsUpDown from "lucide-solid/icons/chevrons-up-down";
import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "~/lib/utils";

const Select = KobalteSelect;

/* Options are `{ label: string }` objects app-wide; the trigger shows the
   selected option's label (Kobalte's Value renders nothing by default). */
const SelectTrigger: Component<
	ComponentProps<typeof KobalteSelect.Trigger> & { placeholder?: string }
> = (props) => {
	const [local, rest] = splitProps(props, ["class", "placeholder"]);
	return (
		<KobalteSelect.Trigger
			class={cn(
				"flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-input bg-background px-3 py-2",
				"text-sm ring-offset-background",
				"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
				"disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
				local.class,
			)}
			{...rest}
		>
			<KobalteSelect.Value<{ label: string }> class="truncate">
				{(state) =>
					state.selectedOption()?.label ?? local.placeholder ?? "Select…"
				}
			</KobalteSelect.Value>
			<KobalteSelect.Icon>
				<ChevronsUpDown class="size-4 opacity-50" />
			</KobalteSelect.Icon>
		</KobalteSelect.Trigger>
	);
};

const SelectContent: Component<ComponentProps<typeof KobalteSelect.Content>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<KobalteSelect.Portal>
			<KobalteSelect.Content
				class={cn(
					"relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-overlay",
					local.class,
				)}
				{...rest}
			>
				<KobalteSelect.Listbox class="p-1" />
			</KobalteSelect.Content>
		</KobalteSelect.Portal>
	);
};

const SelectItem: Component<ComponentProps<typeof KobalteSelect.Item>> = (
	props,
) => {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<KobalteSelect.Item
			class={cn(
				"relative flex w-full cursor-default select-none items-center rounded-[0.25rem] py-1.5 pr-2 pl-8 text-sm outline-none",
				"focus:bg-accent focus:text-accent-foreground",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<span class="absolute left-2 flex size-3.5 items-center justify-center">
				<KobalteSelect.ItemIndicator>
					<Check class="size-4" />
				</KobalteSelect.ItemIndicator>
			</span>
			<KobalteSelect.ItemLabel>{local.children}</KobalteSelect.ItemLabel>
		</KobalteSelect.Item>
	);
};

export { Select, SelectTrigger, SelectContent, SelectItem };
