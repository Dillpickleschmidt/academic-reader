import { cva } from "class-variance-authority";

export const buttonVariants = cva(
	[
		"inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium text-sm",
		"ring-offset-background transition-colors",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
		"disabled:pointer-events-none disabled:opacity-50",
		"[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	],
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/85",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/85",
				outline:
					"border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost:
					"text-muted-foreground hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-3.5",
				sm: "h-7 px-2.5 text-xs",
				lg: "h-10 px-6",
				icon: "size-8",
				"icon-sm": "size-7 text-xs [&_svg]:size-3.5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);
