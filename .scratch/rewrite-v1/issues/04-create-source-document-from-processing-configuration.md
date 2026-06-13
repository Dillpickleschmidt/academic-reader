Status: ready-for-agent

# Create Source Document from confirmed Processing Configuration

## What to build

Let a Reader confirm Processing Configuration after upload completes. If unauthenticated, prompt sign-in at that point. After authentication, create a Source Document, persist its one Processing Configuration snapshot, promote the temporary upload into document storage, and start the single Processing Run.

## Acceptance criteria

- [ ] Start Processing is disabled until upload completes.
- [ ] Processing Configuration includes Conversion Model, page range, Marker options, Narration enabled, and Narration voice.
- [ ] Configuration Preferences are saved by default, except actual page range text is not reused across Source Documents.
- [ ] Source Document is created only after authentication.
- [ ] One Source Document has one immutable Processing Configuration and one Processing Run.

## Blocked by

- `.scratch/rewrite-v1/issues/03-storage-temporary-direct-upload.md`
