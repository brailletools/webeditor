# webeditor

A website for working with braille documents: type braille, or upload
a braille file, and view it alongside the same document as LaTeX or
Markdown — editing either side updates the other. Download the result
as LaTeX, Markdown, or Word, or open an HTML preview. It supports math
in Nemeth format. Try it at https://brailletools.org/

## What it does

- **Two live-synced panes.** The braille pane is the source of truth; the second pane shows
  LaTeX or Markdown (switch with the format selector). Edits in either pane update the other at
  paragraph/equation granularity, and anything that can't be synced is listed under "sync issues"
  with a link to jump to it.
- **Upload** `.brf` / `.brl` (braille), `.md`, `.tex` and `.docx` (converted through Pandoc,
  in your browser), or **photos of embossed braille pages** (read with OCR, entirely client-side).
- **Download** LaTeX, Markdown, or Word, or **Open HTML** for a preview.
- **Braille table** — the liblouis table used to translate between braille and text.
- **Treat each braille line as a paragraph** — a blank line starts a
  new paragraph and a single line break is just a wrapped line (right
  for hard-wrapped BRFs). Turn it on for files where every line is its
  own paragraph, so you don't need blank lines between them in the
  braille. 

Everything runs in the browser; nothing you upload is sent to a server.

### Accessible PDFs

The downloaded `.tex` is set up to compile to a **tagged PDF (PDF/UA-2)** — the structure, language, document title and MathML-tagged math that screen readers need. The title comes from the file name. Compile it with `pdflatex` or `lualatex` from **TeX Live / MiKTeX 2025 or later** (older versions don't understand the tagging commands). This produces the tags but doesn't validate them; check the PDF with [veraPDF](https://verapdf.org/) or PAC before claiming conformance. Details and one `lualatex` limitation are in [braille-bridge's README](https://github.com/brailletools/braille-bridge#wraplatexdocumentbody--title-author-lang-accessible-).

## Developing

Uses Node 20 and [pnpm](https://pnpm.io/) 10. The conversion and
OCR code live in sibling repositories that this project installs from
**sibling directories**, so check them out next to this one:

```
braille/
├── webeditor/      ← this repo
├── braille-bridge/ ← https://github.com/brailletools/braille-bridge
└── brailleocr/     ← https://github.com/brailletools/brailleocr
```

```bash
pnpm install
pnpm dev                # fetches liblouis + the OCR models, then starts Vite
pnpm dev -- --open      # ...and opens the app in a browser tab
```

If you change a sibling repo, re-run `pnpm install` and clear `node_modules/.vite` — pnpm copies
`file:` dependencies, so the app won't see the change otherwise.

### Pinned versions

CI (and the deploy) don't use your local siblings; they clone the exact tags named in:

| File                     | Repository                                                       | Purpose                             |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------- |
| `braille-bridge.version` | [braille-bridge](https://github.com/brailletools/braille-bridge) | braille ⟷ LaTeX/Markdown conversion |
| `brailleocr.version`     | [brailleocr](https://github.com/brailletools/brailleocr)         | photo OCR                           |
| `dataset.version`        | [dataset](https://github.com/brailletools/dataset)               | OCR model weights                   |

To pick up a new release, change the file in a pull request — see [RELEASING.md](RELEASING.md).

### Checks

```bash
pnpm lint                                # Prettier + ESLint
pnpm check                               # Svelte type check
pnpm test:unit                           # Vitest
pnpm exec playwright install chromium    # once
pnpm test:a11y                           # axe-core accessibility checks (see CLAUDE.md)
pnpm test:sync                           # bidirectional sync, in a real browser
pnpm test:format                         # second-pane formats and uploads
```

Run `pnpm test:a11y` after any UI change — this tool's audience includes screen-reader users, so
treat a failure as a real bug.

## Building

```bash
pnpm build      # static site in build/
pnpm preview
```

## Contributing and releases

Changes go through pull requests that must pass CI; `main` deploys to GitHub Pages when a PR is
merged, and releases are version tags on `main`. See [RELEASING.md](RELEASING.md).

## Dependencies & Credits

This project uses the following open-source libraries:

### [braille-bridge](https://github.com/brailletools/braille-bridge)

The braille ⟷ LaTeX/Markdown conversion and the live-sync document model.

- **License**: BSD-3-Clause

### [brailleocr](https://github.com/brailletools/brailleocr) and [onnxruntime-web](https://github.com/microsoft/onnxruntime)

Reads photos of embossed braille pages, running ONNX models in the browser.

- **License**: BSD-3-Clause (brailleocr), MIT (onnxruntime-web)

### [Abraham](https://www.desmos.com/api/v1.11/docs/abraham.html) (Desmos)

Handles Nemeth to LaTeX conversion for mathematical notation.

- **License**: Proprietary (Desmos API)
- **Usage**: Converts ASCII Braille math (Nemeth) to LaTeX format

### [liblouis](https://github.com/liblouis/liblouis)

Provides Braille translation tables and conversion logic for various languages and Braille grades.

- **License**: LGPL v2.1+
- **Usage**: Translates between Braille and text, supports Grade 1, Grade 2, and UEB; the
  [JavaScript binding](https://github.com/liblouis/liblouis.js) (compiled to WebAssembly) runs it
  in the browser

### [pandoc-wasm](https://github.com/pandoc/pandoc-wasm)

[Pandoc](https://pandoc.org/) compiled to WebAssembly.

- **License**: GPL-2.0-or-later
- **Usage**: Converts uploaded `.tex` / `.docx` files to Markdown, and Markdown to Word

### [latex.js](https://github.com/michael-brade/LaTeX.js)

A JavaScript LaTeX parser that generates HTML from LaTeX source code, enabling client-side rendering.

- **License**: MIT
- **Usage**: Converts LaTeX to HTML for the "Open HTML" preview
