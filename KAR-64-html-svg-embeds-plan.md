# KAR-64: HTML/SVG Embeds in the Editor

**Linear:** https://linear.app/karats/issue/KAR-64/brainstorm-html-div-and-svg-embeds-in-the-editor

I'd implement this as a **sandboxed HTML/SVG preview over Markdown source**, using Mermaid as the model. I inspected [GitHub #266](https://github.com/SidhuK/Glyph/issues/266), KAR-64, and the current editor bridge. The key move: **do not inject arbitrary HTML into the TipTap/editor DOM**. Render it in rich mode through a sandboxed iframe, while the note still stores normal Markdown source.

## Recommended Shape

Primary syntax:

````md
```html
<div id="app"></div>
<style>
  #app { padding: 16px; }
</style>
<script>
  document.querySelector("#app").textContent = "Live HTML block";
</script>
```
````

````md
```svg
<svg viewBox="0 0 200 80">
  <rect width="200" height="80" rx="12" fill="tomato" />
  <text x="100" y="48" text-anchor="middle">Glyph</text>
</svg>
```
````

In **rich/edit mode**, these render as embeds. When selected, they reveal the underlying code block, same as Mermaid. In raw/plain mode, they remain source code.

I'd also add a second pass for raw Markdown HTML blocks:

```md
<div class="demo">
  <button id="count">0</button>
</div>
<script>
  count.onclick = () => count.textContent = Number(count.textContent) + 1;
</script>
```

The bridge would protect that raw block before TipTap parses it, internally treat it like an `html` code block, then serialize it back exactly as raw HTML.

## Files Touched

- [`codeBlockHighlighting.ts`](src/components/editor/extensions/codeBlockHighlighting.ts): add first-class `html` and `svg` languages instead of only aliasing them to `xml`.
- [`index.ts`](src/components/editor/extensions/index.ts): register the new preview extension next to `MermaidPreview`.
- [`htmlEmbedPreview.ts`](src/components/editor/extensions/htmlEmbedPreview.ts): new ProseMirror decoration extension, largely modeled on `mermaidPreview.ts`.
- [`htmlEmbed/sandbox.ts`](src/components/editor/extensions/htmlEmbed/sandbox.ts): build the iframe `srcdoc`, CSP, error states, sizing metadata.
- [`htmlEmbedMarkdown.ts`](src/components/editor/markdown/htmlEmbedMarkdown.ts): preprocess/postprocess raw HTML blocks so TipTap does not strip or reinterpret them.
- [`wikiLinkMarkdownBridge.ts`](src/components/editor/markdown/wikiLinkMarkdownBridge.ts): call the HTML embed bridge in the existing markdown pipeline.
- [`slashCommands.ts`](src/components/editor/slashCommands.ts): add `/html` and `/svg` commands that insert starter fenced blocks.
- [`26-node-note-overlays.css`](src/styles/app/26-node-note-overlays.css): add `.htmlEmbedWidget`, `.htmlEmbedFrame`, `.htmlEmbedControls`, `.htmlEmbedError`.
- [`printHtml.ts`](src/lib/printHtml.ts): keep print/export static and sanitized; do not execute embedded JS in print output.

## Core Code Sketch

The sandbox builder should look roughly like:

```ts
const HTML_EMBED_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
].join("; ");

export function buildHtmlEmbedSrcDoc(source: string, kind: "html" | "svg") {
  const body = kind === "svg" ? `<main>${source}</main>` : source;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_EMBED_CSP}">
<style>
  html, body { margin: 0; min-height: 100%; background: transparent; }
  body { font: 14px system-ui, sans-serif; color: #171717; }
</style>
</head>
<body>${body}</body>
</html>`;
}
```

The iframe should be created with:

```ts
iframe.setAttribute("sandbox", "allow-scripts");
iframe.setAttribute("referrerpolicy", "no-referrer");
iframe.srcdoc = buildHtmlEmbedSrcDoc(source, kind);
```

No `allow-same-origin`, no top-navigation, no popups, no external network. Inline JS/CSS works; workspace access does not.

## Preview Behavior

`HtmlEmbedPreview` should scan `codeBlock` nodes where language is `html` or `svg`.

If the editor is editable and the selection touches the block, show source. Otherwise:

```ts
Decoration.node(pos, to, {
  class: "htmlEmbedCodeBlockHiddenInPreview",
});

Decoration.widget(to, () =>
  createHtmlEmbedWidget({
    source,
    kind,
    editable,
    onEditCode: () => selectCodeBlockSource(view, pos, node.nodeSize),
  }),
);
```

That keeps the editing model simple: source is still the truth; preview is disposable UI.

## Round-Trip Bridge

For raw HTML blocks, add:

```ts
export function preprocessHtmlEmbeds(markdown: string): string {
  // Outside fenced code only:
  // convert top-level <div>...</div>, <svg>...</svg>, <script>...</script>,
  // <style>...</style> runs into fenced html/svg blocks with a sentinel.
}

export function postprocessHtmlEmbeds(markdown: string): string {
  // Convert sentinel fenced blocks back to their original raw HTML form.
}
```

Then wire it inside [`wikiLinkMarkdownBridge.ts`](src/components/editor/markdown/wikiLinkMarkdownBridge.ts), near `preprocessDetailsMarkdown`/`postprocessDetailsMarkdown`.

## Important Product Calls

- I'd make fenced `html`/`svg` the official, documented path. Raw `<div>` passthrough can work, but fenced blocks are clearer, safer, and match the "raw mode looks like code" requirement.
- I would not support arbitrary inline HTML inside a normal paragraph in the first implementation. Block embeds are clean; inline executable DOM inside paragraph flow gets messy fast with selection, layout, cursor mapping, and iframe sizing.
- No Rust/Tauri work should be needed. This can stay entirely in the frontend editor layer.
