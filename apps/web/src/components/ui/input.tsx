import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "~/lib/utils";

export type InputProps = ComponentProps<"input"> & {
	class?: string;
};

export const Input: Component<InputProps> = (props) => {
	const [local, rest] = splitProps(props, ["class", "type"]);
	return (
		<input
			type={local.type ?? "text"}
			class={cn(
				"flex h-9 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm",
				"ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm",
				"placeholder:text-dim",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				"disabled:cursor-not-allowed disabled:opacity-50",
				local.class,
			)}
			{...rest}
		/>
	);
};
