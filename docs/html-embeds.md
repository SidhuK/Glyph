# HTML and SVG embeds in Glyph

Glyph can run HTML and SVG inside a note without turning your editor into a web page. You keep normal Markdown on disk. In rich mode, fenced `html` and `svg` blocks render as live previews inside a sandboxed iframe. Click into the block and you edit source again. The pattern matches Mermaid: preview is disposable UI, source is the contract.

## What you write

The supported path is a fenced code block with an explicit language tag:

````md
```html
<div id="app"></div>
<style>#app { padding: 16px; }</style>
<script>
  document.getElementById("app").textContent = "Hello from the embed";
</script>
```
````

SVG blocks use the same shape with `svg` as the fence language:

````md
```svg
<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="80" rx="12" fill="tomato" />
  <text x="100" y="48" text-anchor="middle">Glyph</text>
</svg>
```
````

Glyph also accepts raw block-level HTML in Markdown. If you paste a top-level `<div>`, `<svg>`, `<script>`, or `<style>` run outside any fence, the markdown bridge rewrites it internally into a fenced `html` block for editing, then serializes it back to raw HTML when the note is saved. Fenced blocks are easier to read, harder to break, and what we recommend for anything you plan to keep.

Inline HTML inside a normal paragraph does not preview. Block embeds only.

You can insert starter blocks from the slash menu (`/html`, `/svg`).

## What happens when you open the note

The flow has four stages.

**1. Markdown ingest.** Before TipTap parses the note, `preprocessHtmlEmbeds` walks the Markdown. Raw HTML runs become fenced blocks tagged with a hidden sentinel (`<!--glyph-raw-html-embed-->`). Fenced blocks pass through unchanged.

**2. Editor document.** TipTap stores your embed as a `codeBlock` node with `language: "html"` or `language: "svg"`. The text content is your source. Nothing from the embed lands in the ProseMirror DOM as live HTML.

**3. Preview decoration.** `HtmlEmbedPreview` scans `html` and `svg` code blocks. Previews stay off until you click the play control in the code-block toolbar (same pattern as Mermaid). Once enabled for a block, the extension hides the source visually and mounts a sandboxed iframe widget after the node while your selection is outside that block.

**4. Serialization.** On save, `postprocessHtmlEmbeds` reverses the raw-HTML sentinel conversion so notes that started as bare `<div>` blocks stay bare `<div>` blocks.

Click the play control to render a preview. While the preview is active, click into the block to edit source again, or use "Edit code" on the preview frame. Switching notes clears enabled previews so iframes are not left mounted in the background.

## Inside the iframe

Each preview iframe loads your source through `srcdoc`. Glyph wraps it in a minimal HTML shell with a Content Security Policy and a small bootstrap script that reports height and JavaScript errors back to the parent.

Sandbox attribute:

```text
sandbox="allow-scripts allow-downloads"
```

What that means in practice:

| Allowed | Blocked |
|---------|---------|
| Inline `<script>` and inline `style=""` | `allow-same-origin` (no access to Glyph's DOM, cookies, or `localStorage`) |
| `data:` and `blob:` images, fonts, media | Network requests (`connect-src 'none'`) |
| Canvas, SVG, DOM APIs inside the frame | Form submission to external URLs |
| `postMessage` to parent for sizing/errors | `window.open`, top navigation, popups |
| `URL.createObjectURL` for downloads | External `<script src>`, `<link href>`, `@import url(...)` |

CSP on the embed document:

```text
default-src 'none'
script-src 'unsafe-inline'
style-src 'unsafe-inline'
img-src data: blob:
font-src data:
media-src data: blob:
connect-src 'none'
form-action 'none'
```

Your block must be self-contained. Bundle styles in `<style>` tags or inline attributes. Put logic in inline `<script>` blocks or generate markup from script. If you need images, inline SVG works well; raster images need `data:` URLs or blobs you create in script.

Glyph does not inject its theme tokens into the iframe. CSS variables like `var(--primary)` or `var(--foreground)` only work if you define them inside the embed:

```html
<style>
  :root {
    --foreground: #171717;
    --primary: #2563eb;
    --border: #e5e5e5;
  }
</style>
```

## Sizing

The iframe starts at 240px tall. After load, a `ResizeObserver` inside the embed measures `document.body` and sends the height to Glyph through `postMessage`. The widget clamps that value between 80px and 960px.

Layouts that depend on `height: 100%` or `flex: 1` without a definite parent height often collapse inside the frame. Give the root element a `min-height` (for example `min-height: 220px`) and set `min-height` on chart or plot containers you care about.

## What you can build

These work well inside the sandbox:

- Charts drawn with Canvas, inline SVG, or script-generated SVG strings
- Interactive widgets: buttons, sliders, tabs, toggles, local state
- CSS animations and transitions
- Seeded random data, timers, `requestAnimationFrame` loops
- File downloads via `Blob` + `URL.createObjectURL`
- Math and layout computed entirely in JavaScript

These do not work, or need rework:

- Fetching APIs, WebSockets, or loading CDN scripts
- Google Fonts or any external stylesheet
- `<img src="https://...">` or background images from URLs
- Reading other notes, the filesystem, or Tauri IPC
- `localStorage` shared with Glyph (no same-origin)
- Inline HTML mixed into paragraph text

Complexity is fine. A long single-file dashboard with hundreds of lines of CSS and JS runs the same as a ten-line snippet, as long as everything ships inline and respects the CSP.

## Print and export

Live preview runs JavaScript. Print does not.

When you print a note, `printHtml.ts` replaces fenced `html`/`svg` blocks with static HTML sanitized through DOMPurify. Scripts are stripped. You get markup and styles that survived sanitization, not the runtime output of your JS. A chart built entirely in SVG markup prints. A chart drawn on Canvas at runtime prints as an empty canvas unless you also emit static SVG or HTML for print.

Plan for that split if export fidelity matters.

## Raw HTML round-trip

The bridge recognizes consecutive runs of block-level tags: `<div>`, `<svg>`, `<script>`, `<style>`. A `<div>` that wraps an internal `<script>` counts as one element; the parser tracks nested tag depth.

Runs inside fenced code blocks are left alone. The preprocessor only touches prose regions.

If you open a note in raw Markdown mode, you see fences (or raw HTML if that is how the note was stored). In rich mode, click the play control on an `html` or `svg` block to render its preview.

## Debugging a broken embed

| Symptom | Likely cause |
|---------|----------------|
| Code visible, no iframe | Preview not started yet — click the play control; or cursor is inside the block; or language is `xml` instead of `html` |
| Blank or tiny preview | `height: 100%` collapse; add `min-height` |
| Chart draws but colors are wrong | Glyph CSS variables used without a local `:root` definition |
| Red error line under the embed | JavaScript threw; fix the script |
| Works in preview, empty in print | Output depends on JS execution; add static SVG or accept print limits |

Errors from the iframe surface in `.htmlEmbedError` under the preview frame.

## Related code

| File | Role |
|------|------|
| `src/components/editor/extensions/htmlEmbedPreview.ts` | Preview decorations, play-to-render toggling |
| `src/components/editor/extensions/htmlEmbed/sandbox.ts` | `srcdoc` builder, CSP, iframe widget, sizing |
| `src/components/editor/markdown/htmlEmbedMarkdown.ts` | Raw HTML preprocess/postprocess |
| `src/components/editor/markdown/wikiLinkMarkdownBridge.ts` | Pipeline wiring |
| `src/lib/printHtml.ts` | Static sanitization for print |
| `src/styles/app/26-node-note-overlays.css` | `.htmlEmbedWidget`, frame, error styles |

---

## Prompt: make an existing HTML file Glyph-compatible

Copy this prompt into Cursor (or any agent) with your HTML file attached:

```text
Convert the attached HTML file into a single Glyph HTML embed block I can paste into a note.

Requirements:
- Output one fenced block: ```html ... ``` with all content self-contained inside it.
- Inline all CSS from <style> tags and external stylesheets; drop rules that depend on selectors outside the embed.
- Inline or rewrite all JavaScript from <script> tags; remove external <script src="..."> and module imports. No fetch, XHR, or WebSocket.
- Replace every var(--*) with literal colors or define a :root { ... } block at the top of the embed with explicit hex values. Do not reference Glyph theme tokens.
- Replace external images and fonts with inline SVG, data: URLs, or system font stacks.
- Change height: 100% / flex: 1 layouts that need a parent height to min-height values so the embed sizes correctly in a sandboxed iframe (80px–960px, default 240px).
- Keep interactive behavior that runs entirely in inline script (buttons, charts, animations).
- Remove <base>, forms that post externally, iframes, and anything that requires network access.
- If the page has <html>/<head>/<body>, extract only what belongs in the embed body; do not nest a full document.
- Preserve the visual design and behavior as closely as the sandbox allows.
- After the block, list what you changed and anything that cannot be ported (with a one-line reason each).
```
