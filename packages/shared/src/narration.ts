export const narrationPreparations = [
	"plain",
	"inline-citation-cleanup",
	"inline-math",
	"equation-explanation",
] as const;

export type NarrationPreparation = (typeof narrationPreparations)[number];

export const hardIneligibleNarrationReasons = [
	"empty",
	"image-only",
	"table-only",
	"page-header",
	"page-footer",
	"code",
	"form",
	"doi",
	"copyright",
] as const;

export type HardIneligibleNarrationReason =
	(typeof hardIneligibleNarrationReasons)[number];

export const softIneligibleNarrationReasons = [
	"document-metadata",
	"reference-entry",
	"bibliography-heading",
	"table-of-contents",
	"unknown-noise",
] as const;

export type SoftIneligibleNarrationReason =
	(typeof softIneligibleNarrationReasons)[number];

export const apiIneligibleNarrationReasons = ["review-failed"] as const;

export type ApiIneligibleNarrationReason =
	(typeof apiIneligibleNarrationReasons)[number];

export const ineligibleNarrationReasons = [
	...hardIneligibleNarrationReasons,
	...softIneligibleNarrationReasons,
	...apiIneligibleNarrationReasons,
] as const;

export type IneligibleNarrationReason =
	(typeof ineligibleNarrationReasons)[number];

export const narrationAlignmentStatuses = [
	"ok",
	"unavailable",
	"failed",
] as const;

export type NarrationAlignmentStatus =
	(typeof narrationAlignmentStatuses)[number];

export const narrationAlignmentSources = [
	"native",
	"forced-alignment",
] as const;

export type NarrationAlignmentSource =
	(typeof narrationAlignmentSources)[number];

export interface NarrationWordTimestamp {
	word: string;
	startMs: number;
	endMs: number;
}

export interface NarrationAudioAlignment {
	status: NarrationAlignmentStatus;
	source?: NarrationAlignmentSource;
	error?: string;
}

export type BlockNarration =
	| {
			decision: "eligible";
			preparation: NarrationPreparation[];
			text?: string;
	  }
	| {
			decision: "ineligible";
			reason: IneligibleNarrationReason;
	  };
