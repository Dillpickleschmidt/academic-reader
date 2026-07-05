import { createSignal, onCleanup, onMount } from "solid-js";
import {
	type EquationExplanationNarrationReadyMessage,
	type EquationExplanationNarrationRequestMessage,
	equationExplanationMessageTypes,
	equationExplanationSrcdoc,
} from "./equation-explanation-html";
import {
	createRemoteNarrationWordHighlighter,
	type NarrationWordHighlighter,
} from "./narration-word-highlighting";

export type EquationExplanationNarrationHighlighterFactory =
	() => NarrationWordHighlighter;

export function EquationExplanationPanel(props: {
	contentHtml: string;
	onNarrationHighlighterReady?: (
		createHighlighter:
			| EquationExplanationNarrationHighlighterFactory
			| undefined,
	) => void;
	onNarrationRequest?: (visibleWordIndex: number | undefined) => void;
}) {
	let iframe: HTMLIFrameElement | undefined;
	const [height, setHeight] = createSignal(360);

	onMount(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== iframe?.contentWindow) return;
			const data = event.data;
			if (typeof data !== "object" || data === null) return;
			if (
				data.type === equationExplanationMessageTypes.height &&
				typeof data.height === "number"
			) {
				setHeight(Math.min(Math.max(Math.ceil(data.height), 160), 900));
				return;
			}
			if (
				data.type === equationExplanationMessageTypes.narrationReady &&
				isEquationExplanationNarrationReadyMessage(data) &&
				iframe
			) {
				props.onNarrationHighlighterReady?.(() =>
					createRemoteNarrationWordHighlighter({
						visibleWords: data.visibleWords,
						postHighlightRange: (range) =>
							iframe?.contentWindow?.postMessage(
								{
									type: equationExplanationMessageTypes.narrationHighlight,
									range,
								},
								"*",
							),
					}),
				);
				return;
			}
			if (
				data.type === equationExplanationMessageTypes.narrationRequest &&
				isEquationExplanationNarrationRequestMessage(data)
			) {
				props.onNarrationRequest?.(data.visibleWordIndex);
			}
		};

		window.addEventListener("message", handleMessage);
		onCleanup(() => {
			window.removeEventListener("message", handleMessage);
			props.onNarrationHighlighterReady?.(undefined);
		});
	});

	return (
		<details class="mt-3 rounded-sm border border-border bg-card/40 font-sans">
			<summary class="cursor-pointer px-3 py-2 font-medium text-primary text-sm marker:text-dim">
				Explain equation
			</summary>
			<div class="border-border border-t p-2">
				<iframe
					ref={(element) => {
						iframe = element;
					}}
					class="block w-full rounded-sm border-0 bg-background"
					sandbox="allow-scripts"
					srcdoc={equationExplanationSrcdoc(props.contentHtml)}
					style={{ height: `${height()}px` }}
					title="Equation Explanation"
				/>
			</div>
		</details>
	);
}

function isEquationExplanationNarrationReadyMessage(
	data: unknown,
): data is EquationExplanationNarrationReadyMessage {
	return (
		isRecord(data) &&
		data.type === equationExplanationMessageTypes.narrationReady &&
		Array.isArray(data.visibleWords) &&
		data.visibleWords.every((word) => typeof word === "string")
	);
}

function isEquationExplanationNarrationRequestMessage(
	data: unknown,
): data is EquationExplanationNarrationRequestMessage {
	return (
		isRecord(data) &&
		data.type === equationExplanationMessageTypes.narrationRequest &&
		(data.visibleWordIndex === undefined ||
			(typeof data.visibleWordIndex === "number" &&
				Number.isInteger(data.visibleWordIndex) &&
				data.visibleWordIndex >= 0))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
