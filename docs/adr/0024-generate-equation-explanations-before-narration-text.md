# Narration overlaps Equation Explanation generation

Equation Explanations are generated reader-facing content attached to existing equation Blocks, not new Blocks. When both Equation Explanations and Narration are enabled for a Document, Narration Eligibility may run before explanations are ready and may mark standalone equation Blocks eligible for later Narration Text. Narration Guide and Narration Text generation start with eligible Blocks whose content for Narration Text is already available instead of waiting for every Equation Explanation.

Standalone equation Blocks still use Equation Explanations as the content for Narration Text. Equation Blocks whose explanations are not ready stay pending during Narration Text generation; as each Equation Explanation is persisted, that Block can be prepared, inserted into the Narration audio queue, and ordered against other currently available Blocks by Block order. When Equation Explanation generation ends, any still-missing standalone equation Blocks are marked ineligible with `equation-explanation-unavailable`.

This refines ADR-0022: Equation Explanations remain a non-blocking enhancement to Reader View readiness, and they are upstream context for their own equation Blocks, but they no longer gate unrelated Blocks' Narration Text or audio.
