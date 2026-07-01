import type { AnyExtension } from "@tiptap/core";
import type { MathEditRequest } from "../extensions/math/mathOptions";

type MathExtensionFactory = (options: {
	onEditRequest: (request: MathEditRequest) => void;
}) => AnyExtension[];

let factoryPromise: Promise<MathExtensionFactory> | null = null;

export function loadMathExtensionFactory(): Promise<MathExtensionFactory> {
	factoryPromise ??= Promise.all([
		import("../extensions/math/markdownMath"),
		import("katex/dist/katex.min.css"),
	])
		.then(([module]) => module.createGlyphMathExtensions)
		.catch((error: unknown) => {
			factoryPromise = null;
			throw error;
		});
	return factoryPromise;
}
