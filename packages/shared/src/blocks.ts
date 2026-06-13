export const blockTypes = [
	"paragraph",
	"heading",
	"table",
	"figure",
	"equation",
	"caption",
	"listItem",
	"pageHeader",
	"pageFooter",
	"footnote",
	"code",
	"form",
	"unknown",
] as const;

export type BlockType = (typeof blockTypes)[number];

const markerBlockTypes: Record<string, BlockType> = {
	Text: "paragraph",
	SectionHeader: "heading",
	Title: "heading",
	Table: "table",
	TableGroup: "table",
	Picture: "figure",
	Figure: "figure",
	FigureGroup: "figure",
	Equation: "equation",
	Caption: "caption",
	ListItem: "listItem",
	PageHeader: "pageHeader",
	PageFooter: "pageFooter",
	Footnote: "footnote",
	Code: "code",
	Form: "form",
};

export function markerBlockType(rawBlockType: string): BlockType {
	return markerBlockTypes[rawBlockType] ?? "unknown";
}
