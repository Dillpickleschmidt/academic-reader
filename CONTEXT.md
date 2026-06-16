# Academic Reader

Academic Reader is for importing, inspecting, and reading Documents.

## Language

**Reader**:
A signed-in person using Academic Reader to inspect and read Documents.
_Avoid_: user, account holder

**Document**:
The persisted reading object in Academic Reader. A Document has a Source Document, Pages, Blocks, Processing Events, and a Reader View.
_Avoid_: Source Document, upload, file

**Source Document**:
The original PDF or single image that the reader brings into Academic Reader.
_Avoid_: Document, upload, file, asset

**Page**:
One visual surface from a Source Document. A single-image Source Document has exactly one Page.
_Avoid_: sheet, canvas, image page

**Physical Page**:
The one-based position of a Page within a Source Document, used for storage, links, and Source View navigation.
_Avoid_: display page, printed page

**Page Label**:
An optional label provided by a Source Document for a Physical Page, such as a roman numeral or printed page number.
_Avoid_: page offset, inferred page

**Table of Contents Entry**:
A source-provided outline entry for a Document. It may have a direct target when the Source Document provides a destination Academic Reader can resolve.
_Avoid_: inferred TOC item, guessed heading

**Table of Contents Target**:
The resolved destination of a Table of Contents Entry, such as a Physical Page, optional Source Point, and optional Block. A missing target means the entry can be shown but not navigated.
_Avoid_: guessed link, inferred heading match

**Block**:
A meaningful region on a Page, such as a paragraph, heading, table, figure, equation, caption, or list item.
_Avoid_: chunk, node, segment

**Block Type**:
The visible role of a Block in the Source Document, such as paragraph, heading, table, figure, equation, caption, list item, or unknown.
_Avoid_: raw label, provider type

**Source Geometry**:
The location and shape of a Block on a Page.
_Avoid_: bbox, coordinates

**Source Point**:
A precise point on a Page provided by the Source Document, such as a PDF outline destination point.
_Avoid_: guessed coordinate, inferred heading location

**Block Evidence**:
The observable details that explain what is known about a Block, including its type, source geometry, text, confidence, and processing history.
_Avoid_: metadata, properties

**Source View**:
The page-faithful view of the Source Document.
_Avoid_: original PDF viewer, image preview

**Reader View**:
The reader-facing presentation derived from Blocks after inspection and cleanup.
_Avoid_: Readable View, final HTML, rendered output

**Debug Overlay**:
A reader-facing mode that draws always-visible Block regions over Source View and Reader View content without changing their layout, with Block Evidence available on hover or focus so the reader can inspect what Academic Reader knows without leaving the document.
_Avoid_: inspector panel, admin console, hidden devtools, in-flow debug chrome

**Narration**:
Spoken audio generated from Blocks in the Reader View.
_Avoid_: TTS, audio generation

**Narration Text**:
The spoken form of a Block used to produce Narration.
_Avoid_: TTS text, rewrite, script

**Narration Candidate**:
The text-bearing material from a Block considered for Narration after non-narratable content is removed.
_Avoid_: classifier input, filtered HTML, TTS candidate

**Narration Eligibility**:
A decision about whether a Block should contribute to Narration.
_Avoid_: block classification, TTS filter, read-aloud flag

**Narration Preparation**:
The preparation needs identified for an eligible Block before creating Narration Text.
_Avoid_: completed steps, TTS route, rewrite mode, generation pipeline

**Inline Citation**:
A citation embedded in Block prose, such as a bracketed author-year reference or numbered citation.
_Avoid_: bibliography entry, reference entry, footnote

**Narration Guide**:
A compact document-level guide that summarizes reading context, terminology, notation, and pronunciation conventions for Narration.
_Avoid_: prompt, AI summary, classifier context

**Narration Word Timing**:
The time range for each spoken word in Narration, used to relate playback position back to the Reader View.
_Avoid_: segment alignment, TTS timestamp, word timestamp

**Narration Word Highlighting**:
A Reader View behavior that marks the words currently being spoken during Narration playback.
_Avoid_: segment highlighting, karaoke mode, TTS highlighting

**Narration Word Seeking**:
Starting or moving Narration playback from the word the Reader selected in the Reader View.
_Avoid_: segment seek, TTS seek, timestamp jump

**Chat**:
A conversation with an AI model from inside the Document page.

**Cross-view Link**:
A direct relationship between the same Block in the Source View and Reader View.
_Avoid_: inferred match, fuzzy match

**Conversion Model**:
The document-understanding model chosen to turn a Source Document into Blocks and a Reader View, such as Marker, LightOnOCR, or Chandra.
_Avoid_: processing mode, backend

**Processing Configuration**:
The reader's choices for a Processing Run, such as Conversion Model, page range, OCR behavior, and narration voice.
_Avoid_: settings, options, preferences

**Configuration Preference**:
A saved default for a Processing Configuration choice, reused for future Processing Runs unless the reader changes it.
_Avoid_: setting, preset

**Processing Run**:
The single attempt to turn a Source Document into Pages, Blocks, and a Reader View for a Document.
_Avoid_: job, task, pipeline

**Processing Event**:
A timestamped observation worth surfacing from a Processing Run, especially worker/model activity, warnings, failures, degraded behavior, and long-running progress.
_Avoid_: status update, progress log, loading state
