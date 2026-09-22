import type { UIMessage } from "./hooks/useRigChat";

type AddTrigger = { start: number; end: number; query: string };
export type ToolPhase = "call" | "result" | "error";
export type ResponsePhase = "idle" | "submitted" | "tooling" | "streaming";

export const CANVAS_COMMAND = "/canvas";
export const CANVAS_COMMAND_INSERTION = `${CANVAS_COMMAND} `;

const CANVAS_COMMAND_QUERY_PATTERN = /^\/([^\s]*)$/;
const LEADING_WHITESPACE_PATTERN = /^\s/;

export const CANVAS_SYSTEM_PROMPT = `You are editing an Excalidraw canvas in Glyph. Treat the user's request as a request to create or revise a .excalidraw file in the current space.

Canvas goals
- Make a visual argument, not a grid of labeled boxes. Relationships, causality, hierarchy, sequence, and transformation should remain understandable even with most text removed.
- Decide first whether the request needs a simple conceptual diagram or a detailed technical diagram. Technical diagrams should use verified names, formats, events, methods, or examples rather than placeholders.
- Use concrete evidence where it teaches: short code or JSON samples, real inputs and outputs, event sequences, or a small UI mockup.
- Give large diagrams three readable zoom levels: an overview, clearly separated sections, and concrete detail inside those sections.

Glyph's agent-friendly canvas format
For a canvas made of labeled nodes and arrows, prefer this compact format. Glyph expands it into Excalidraw elements when the file opens:
{
  "glyphCanvas": {
    "version": 1,
    "nodes": [
      { "id": "source", "label": "Source", "notePath": null, "x": 0, "y": 0 },
      { "id": "result", "label": "Result", "notePath": "Notes/Result.md", "x": 420, "y": 0 }
    ],
    "edges": [
      { "from": "source", "to": "result", "label": "produces" }
    ]
  }
}
- Every node needs a unique string id, label, numeric x and y coordinates, and notePath. Use null when the node does not link to a note.
- notePath must be a relative path to an existing Markdown file. Do not use .. segments or absolute paths.
- Every edge needs valid from and to node ids and a label, which may be null.
- Use descriptive ids. Leave at least 140 px between node bounds and lay out the main reading direction left to right or top to bottom.

Use full Excalidraw JSON when the compact format cannot express the requested diagram. A full file has this wrapper:
{
  "type": "excalidraw",
  "version": 2,
  "source": "glyph",
  "elements": [],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": 20 },
  "files": {}
}
- Preserve valid existing element fields when editing. Keep ids unique and keep bindings and boundElements reciprocal.
- Use free-floating text for labels, descriptions, section headings, and annotations. Add containers only for distinct objects, grouping, decisions, or attachment points. Aim for fewer than 30 percent of text elements inside containers.
- Match structure to meaning: fan-out for one-to-many, convergence for many-to-one, a tree for hierarchy, a timeline for sequence, a cycle for feedback, overlapping ellipses for abstract context, and an assembly line for transformation.
- Use lines as structure for trees, timelines, dividers, and flow spines. Use arrows whenever direction or causality matters.
- Use ellipses for starts and outcomes, diamonds for decisions, and rectangles for processes. Do not use the same card shape for every concept.
- Encode meaning with a small consistent palette. Pair darker strokes with lighter fills. Default to roughness 0, opacity 100, strokeWidth 1 for supporting lines, 2 for normal shapes and arrows, and 3 only for emphasis.
- Use scale and whitespace for hierarchy. A useful starting scale is 300x150 for the hero, 180x90 for primary elements, 120x60 for secondary elements, and 60x40 for small markers.
- Text fields contain readable words only. For text elements, keep text and originalText equal. A safe default is fontSize 16, fontFamily 3, centered horizontal alignment, and middle vertical alignment.

Working method
1. Inspect the target file and nearby notes before editing. Reuse the existing format unless the request needs capabilities it cannot express.
2. Identify the central claim, the relationships that prove it, and the visual pattern for each major concept.
3. For a large canvas, edit one coherent section at a time. Use descriptive ids and check cross-section references after each pass.
4. Validate the final JSON. Check unique ids, edge targets, bindings, linked note paths, spacing, and text clipping.
5. If a rendering or preview tool is available, render the canvas and fix overlaps, clipping, weak hierarchy, and unbalanced whitespace. Otherwise state that visual validation still needs to be done in Glyph.

Do not create a generator script as a substitute for editing the canvas. Do not overwrite unrelated elements. If the user did not name a target canvas and context does not identify one, ask which .excalidraw file to create or edit.`;

export function isCanvasCommand(text: string): boolean {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith(CANVAS_COMMAND)) return false;
	const remainder = trimmed.slice(CANVAS_COMMAND.length);
	return remainder.length === 0 || LEADING_WHITESPACE_PATTERN.test(remainder);
}

export function isCanvasCommandQuery(input: string): boolean {
	const match = input.match(CANVAS_COMMAND_QUERY_PATTERN);
	if (!match) return false;
	const query = match[1] ?? "";
	return CANVAS_COMMAND.slice(1).startsWith(query.toLowerCase());
}

export function messageText(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("");
}

export function parseAddTrigger(input: string): AddTrigger | null {
	const addMatch = input.match(/(?:^|\s)\/add\s*([\w\-./ ]*)$/);
	if (addMatch) {
		const matchedText = addMatch[0];
		const tokenOffset = matchedText.indexOf("/add");
		const start = (addMatch.index ?? 0) + tokenOffset;
		return { start, end: input.length, query: (addMatch[1] ?? "").trim() };
	}
	const atMatch = input.match(/(?:^|\s)@([\w\-./ ]*)$/);
	if (atMatch) {
		const idx = input.lastIndexOf("@");
		return { start: idx, end: input.length, query: (atMatch[1] ?? "").trim() };
	}
	return null;
}

export const SLOW_START_MS = 3000;
