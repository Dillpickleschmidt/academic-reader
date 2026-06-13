## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout. See `docs/agents/domain.md`.

### Backend Choices (set in `.env.local`)

- Conversion Models are reader-facing (`marker|lightonocr|chandra`); deployment config controls whether each enabled model runs locally or on Modal. Datalab is not part of v1.
- `TTS_BACKEND=local|modal|none`
- `STORAGE_BACKEND=minio|r2`

### Git Operations

Agents may run read-only git inspection commands such as `git status`, `git diff`, `git diff --stat`, `git log`, `git show --stat`, `git ls-files`, and `git check-ignore`.

Do not run git commands that modify repository state unless explicitly approved in the current conversation. This includes `git add`, `git commit`, `git reset`, `git checkout`, `git restore`, `git rm`, `git clean`, and `git stash`.

### File Organization

- Public API at top of file
- Private helpers below, in order of usage

```ts
export function mainFunction() {
  helperA()
  helperB()
}

function helperA() { ... }
function helperB() { ... }
```

### No Thin Wrappers

While thin wrappers may be useful for readability in highly repeated invocations, they should generally be avoided when it would be simpler to inline. An example of what NOT to do:

```ts
function isMarkerBlock(block: WorkerChunkBlock): block is MarkerChunkBlock {
  return "id" in block && "block_type" in block;
}
```

### Avoid comments explaining "changes"

While I'm fine with comments and documentation, I don't want any comments that explain code "changes" made as that's useless for new developers.

### Data Loading States

- `undefined` = not yet loaded → show skeleton/loader
- `[]` = loaded but empty → show empty state

Avoid fallbacks like `?? []` that mask the difference. Derive loading state from the data itself or derived reactive data, not separate `isLoading` props.

```tsx
<Show when={data !== undefined} fallback={<Loader />}>
  <Show when={data.length} fallback={<EmptyState />}>
    <Content data={data} />
  </Show>
</Show>
```

### Convex Folder Structure

- `api/` - Thin queries/mutations: define args, pass ctx to model helpers, return
- `model/` - Business logic
