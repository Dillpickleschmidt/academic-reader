import { describe, expect, test } from "bun:test";
import { extractPdfPageLabelsAndOutline } from "./pdf-metadata";

describe("extractPdfPageLabelsAndOutline", () => {
	test("extracts PDF Page Labels", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: pdfBytes({
				catalog: "/PageLabels 8 0 R",
				objects: [[8, "<< /Nums [0 << /S /r >> 1 << /S /D /St 1 >>] >>"]],
			}),
			blocks: [],
		});

		expect([...metadata.pageLabelsByPhysicalPageNumber.entries()]).toEqual([
			[1, "i"],
			[2, "1"],
		]);
	});

	test("flattens nested PDF outline entries and resolves named destinations", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: pdfBytes({
				catalog: "/Outlines 5 0 R /Names << /Dests 10 0 R >>",
				objects: [
					[5, "<< /Type /Outlines /First 6 0 R /Last 6 0 R /Count 2 >>"],
					[
						6,
						"<< /Title (Parent) /Parent 5 0 R /First 7 0 R /Last 7 0 R /Count 1 /Dest [3 0 R /Fit] >>",
					],
					[7, "<< /Title (Child) /Parent 6 0 R /Dest (namedDest) >>"],
					[10, "<< /Names [(namedDest) [4 0 R /FitH 700]] >>"],
				],
			}),
			blocks: [],
		});

		expect(metadata.tableOfContentsEntries).toEqual([
			{
				order: 0,
				depth: 0,
				title: "Parent",
				target: { physicalPageNumber: 1 },
			},
			{
				order: 1,
				depth: 1,
				title: "Child",
				target: { physicalPageNumber: 2 },
			},
		]);
	});

	test("resolves an XYZ destination to a nearest Block top edge target", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: outlinePdf("[3 0 R /XYZ 72 720 null]"),
			blocks: [
				{
					blockId: "/page/0/Text/1",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.1,
						top: 0.08,
						width: 0.1,
						height: 0.05,
					},
				},
			],
		});

		expect(metadata.tableOfContentsEntries[0]?.target).toEqual({
			physicalPageNumber: 1,
			blockId: "/page/0/Text/1",
			sourcePoint: {
				left: 72 / 612,
				top: 72 / 792,
			},
		});
	});

	test("resolves a point just above a heading to the nearest Block top edge", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: outlinePdf("[3 0 R /XYZ 53.798 708.314 null]"),
			blocks: [
				{
					blockId: "/page/0/SectionHeader/2",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.0869140625,
						top: 0.1064453125,
						width: 0.13102687262242135,
						height: 0.01516546384252683,
					},
				},
			],
		});

		expect(metadata.tableOfContentsEntries[0]?.target).toEqual({
			physicalPageNumber: 1,
			blockId: "/page/0/SectionHeader/2",
			sourcePoint: {
				left: 53.798 / 612,
				top: (792 - 708.314) / 792,
			},
		});
	});

	test("falls back to page-only target when no Block top edge is nearby", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: outlinePdf("[3 0 R /XYZ 72 720 null]"),
			blocks: [
				{
					blockId: "/page/0/Text/1",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.5,
						top: 0.5,
						width: 0.1,
						height: 0.1,
					},
				},
			],
		});

		expect(metadata.tableOfContentsEntries[0]?.target).toEqual({
			physicalPageNumber: 1,
			sourcePoint: {
				left: 72 / 612,
				top: 72 / 792,
			},
		});
	});

	test("falls back to page-only target when nearest Block top edges are tied", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: outlinePdf("[3 0 R /XYZ 72 720 null]"),
			blocks: [
				{
					blockId: "/page/0/Text/1",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.1,
						top: 0.08,
						width: 0.1,
						height: 0.05,
					},
				},
				{
					blockId: "/page/0/Text/2",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.1,
						top: 0.08,
						width: 0.1,
						height: 0.05,
					},
				},
			],
		});

		expect(metadata.tableOfContentsEntries[0]?.target).toEqual({
			physicalPageNumber: 1,
			sourcePoint: {
				left: 72 / 612,
				top: 72 / 792,
			},
		});
	});

	test("resolves a FitH destination to exactly one vertical Block target", async () => {
		const metadata = await extractPdfPageLabelsAndOutline({
			bytes: outlinePdf("[3 0 R /FitH 700]"),
			blocks: [
				{
					blockId: "/page/0/Text/1",
					pageNumber: 1,
					normalizedBoundingBox: {
						left: 0.5,
						top: 0.1,
						width: 0.1,
						height: 0.05,
					},
				},
			],
		});

		expect(metadata.tableOfContentsEntries[0]?.target).toEqual({
			physicalPageNumber: 1,
			blockId: "/page/0/Text/1",
		});
	});
});

function outlinePdf(dest: string) {
	return pdfBytes({
		catalog: "/Outlines 5 0 R",
		objects: [
			[5, "<< /Type /Outlines /First 6 0 R /Last 6 0 R /Count 1 >>"],
			[6, `<< /Title (Entry) /Parent 5 0 R /Dest ${dest} >>`],
		],
	});
}

function pdfBytes(input: {
	catalog?: string;
	objects?: Array<[number, string]>;
}) {
	const objects: Array<[number, string]> = [
		[1, `<< /Type /Catalog /Pages 2 0 R ${input.catalog ?? ""} >>`],
		[2, "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>"],
		[
			3,
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
		],
		[
			4,
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
		],
		...(input.objects ?? []),
	];
	let body = "%PDF-1.7\n";
	const offsets: number[] = [0];
	for (const [id, content] of objects) {
		offsets[id] = body.length;
		body += `${id} 0 obj\n${content}\nendobj\n`;
	}

	const xref = body.length;
	const size = Math.max(...objects.map(([id]) => id)) + 1;
	body += `xref\n0 ${size}\n`;
	body += "0000000000 65535 f \n";
	for (let id = 1; id < size; id++) {
		body += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
	}
	body += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

	return new TextEncoder().encode(body);
}
