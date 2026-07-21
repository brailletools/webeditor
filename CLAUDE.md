# Working in this repo

- When fixing a bug, find the root cause rather than patching the symptom — check whether the same assumption or logic is duplicated elsewhere (e.g. a CI workflow with its own hard-coded dependency list, a parallel implementation in another file/language) before considering a fix complete.

## Accessibility

This tool's primary audience includes screen-reader users (NVDA + braille display), so accessibility isn't a checklist item — it's core to the product. Practices already established in this codebase:

- **Prefer native HTML controls over any custom-built alternative.** Use `<button>`, `<select>`, `<input>`, `<textarea>`, and `<label>` — never a styled `<div>`/`<span>` reimplementing a control's behavior with `role`/`tabindex`/keydown handlers. Native elements get correct keyboard behavior, focus handling, and screen-reader semantics for free; custom widgets have to reimplement all of that and routinely get it wrong. Every control in this app so far (the format/table `<select>`s, upload `<input type="file">`, download `<button>`s) is native — keep it that way, and treat reaching for ARIA roles on a non-native element as a last resort, not a first option.
- **Run `pnpm run test:a11y` after any UI change.** It runs axe-core against the live app and fails on critical/serious WCAG 2 A/AA violations — treat a failure as a real bug, not a false positive to suppress.
- **Every interactive control needs an accessible name.** Use `aria-label` on textareas/inputs where visible text isn't enough context (e.g. "LaTeX input, editable"), or a `<label>` paired via `for`/`id` (visually hidden with the `sr-only` class when a visible label would be redundant clutter).
- **Async status needs `role="status" aria-live="polite"`** (loading/progress messages, e.g. OCR stage, Pandoc conversion) and **errors need `role="alert"`** — both patterns are already used throughout `+page.svelte`; match them for new async operations rather than inventing a new convention.
- **Disable + `aria-busy` together** for controls that can't be used mid-operation (see the file input's `disabled`/`aria-busy` tied to `ocrLoading`/`pandocLoading`).
- **Keyboard shortcuts must not collide with NVDA's own commands or the browser/OS.** NVDA's default modifier is Insert/CapsLock, not Ctrl/Alt — prefer multi-modifier combos (e.g. Ctrl+Alt+J) over bare accelerator keys, and check for collisions before adding a new one.
- **Manage focus explicitly when moving it programmatically** (e.g. the sync-issues "go to" links, the jump-to-other-pane shortcut) — call `.focus()` and set an explicit selection range rather than assuming default browser behavior lands somewhere sensible.
