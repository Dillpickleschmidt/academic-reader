# Academic Reader

Academic Reader is a research workbench for importing, inspecting, and reading source documents.

## Language

**Research Workbench**:
A private workspace where a reader turns source documents into inspectable, readable material for study.
_Avoid_: SaaS app, document platform

**Reader**:
A signed-in person using the workbench to inspect and read Source Documents.
_Avoid_: user, account holder

**Source Document**:
A PDF or single image that the reader brings into the workbench as the material to inspect and read.
_Avoid_: upload, file, asset

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
A navigational entry that points directly to a Physical Page or Block when the Source Document provides an explicit destination.
_Avoid_: inferred TOC item, guessed heading

**Block**:
A meaningful region on a Page, such as a paragraph, heading, table, figure, equation, caption, or list item.
_Avoid_: chunk, node, segment

**Block Type**:
The visible role of a Block in the Source Document, such as paragraph, heading, table, figure, equation, caption, list item, or unknown.
_Avoid_: raw label, provider type

**Source Geometry**:
The location and shape of a Block on a Page.
_Avoid_: bbox, coordinates

**Block Evidence**:
The observable details that explain what is known about a Block, including its type, source geometry, text, confidence, and processing history.
_Avoid_: metadata, properties

**Source View**:
The page-faithful view of the original Source Document.
_Avoid_: original PDF viewer, image preview

**Readable View**:
The reader-facing presentation derived from Blocks after inspection and cleanup.
_Avoid_: final HTML, rendered output

**Debug Overlay**:
A reader-facing view that draws visible metadata directly on Blocks so the reader can inspect what the workbench knows without leaving the document.
_Avoid_: inspector panel, admin console, hidden devtools

**Narration**:
Spoken audio generated from Blocks in the Readable View.
_Avoid_: TTS, audio generation

**Narration Text**:
The spoken form of a Block used to produce Narration.
_Avoid_: TTS text, rewrite, script

**Chat**:
A conversation with an AI model from inside the workbench.

**Cross-view Link**:
A direct relationship between the same Block in the Source View and Readable View.
_Avoid_: inferred match, fuzzy match

**Conversion Model**:
The document-understanding model chosen to turn a Source Document into Blocks and a Readable View, such as Marker, LightOnOCR, or Chandra.
_Avoid_: processing mode, backend

**Processing Configuration**:
The reader's choices for a Processing Run, such as Conversion Model, page range, OCR behavior, and narration voice.
_Avoid_: settings, options, preferences

**Configuration Preference**:
A saved default for a Processing Configuration choice, reused for future Processing Runs unless the reader changes it.
_Avoid_: setting, preset

**Processing Run**:
The single attempt to turn a Source Document into Pages, Blocks, and a Readable View.
_Avoid_: job, task, pipeline

**Processing Event**:
A timestamped observation worth surfacing from a Processing Run, especially worker/model activity, warnings, failures, degraded behavior, and long-running progress.
_Avoid_: status update, progress log, loading state
