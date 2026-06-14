import { describe, expect, test } from "bun:test";
import {
	adaptMarkerConversionResult,
	type MarkerConversionResult,
} from "./marker-result";

describe("adaptMarkerConversionResult", () => {
	test("uses Marker block id page path for Source Geometry", () => {
		const result: MarkerConversionResult = {
			content: "",
			metadata: {},
			formats: {
				html: "",
				markdown: "",
				chunks: {
					page_info: {
						0: { bbox: [0, 0, 200, 100] },
						1: { bbox: [0, 0, 100, 100] },
					},
					blocks: [
						{
							id: "/page/0/Text/1",
							block_type: "Text",
							html: "<p>First page</p>",
							page: 200,
							bbox: [50, 25, 150, 75],
						},
						{
							id: "/page/1/Text/2",
							block_type: "Text",
							html: "<p>Second page</p>",
							page: 452,
							bbox: [10, 20, 60, 70],
						},
					],
				},
			},
			images: null,
		};

		const adapted = adaptMarkerConversionResult({ result, imageUrls: {} });

		expect(adapted.pages).toEqual([
			{ physicalPageNumber: 1, width: 200, height: 100 },
			{ physicalPageNumber: 2, width: 100, height: 100 },
		]);
		expect(adapted.blocks.map((block) => block.pageNumber)).toEqual([1, 2]);
		expect(adapted.blocks[0].normalizedBoundingBox).toEqual({
			left: 0.25,
			top: 0.25,
			width: 0.5,
			height: 0.5,
		});
		expect(adapted.blocks[1].normalizedBoundingBox).toEqual({
			left: 0.1,
			top: 0.2,
			width: 0.5,
			height: 0.5,
		});
		expect(adapted.warnings).not.toContain(
			"/page/0/Text/1: bbox ignored because page dimensions are missing",
		);
	});
});
