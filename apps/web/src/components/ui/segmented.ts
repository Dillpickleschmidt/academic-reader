import { cn } from "~/lib/utils";

export const segmentedGroupClass =
	"grid gap-0.5 rounded-sm border border-border p-0.5";

export function segmentedItemClass(active: boolean) {
	return cn(
		"rounded-[0.25rem] transition-colors",
		active
			? "bg-primary/10 font-medium text-primary"
			: "text-muted-foreground hover:text-foreground",
	);
}
