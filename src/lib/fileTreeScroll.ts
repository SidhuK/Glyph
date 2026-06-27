import { cssEscape } from "../utils/dom";

export interface ScrollFileTreePathOptions {
	focus?: boolean;
	maxAttempts?: number;
	retryMs?: number;
	warmupFrames?: number;
}

export function scheduleScrollFileTreePathIntoView(
	path: string,
	options: ScrollFileTreePathOptions = {},
): () => void {
	const {
		focus = false,
		maxAttempts = 10,
		retryMs = 45,
		warmupFrames = 1,
	} = options;
	let attempts = 0;
	let cancelled = false;
	let retryTimer: number | null = null;
	let frameId: number | null = null;

	const tryScroll = () => {
		if (cancelled) return;
		attempts += 1;
		const target = document.querySelector<HTMLElement>(
			`[data-file-tree-path="${cssEscape(path)}"]`,
		);
		if (target) {
			target.scrollIntoView({
				block: "center",
				inline: "nearest",
				behavior: "auto",
			});
			if (focus) {
				target.focus({ preventScroll: true });
			}
			return;
		}
		if (attempts < maxAttempts) {
			retryTimer = window.setTimeout(tryScroll, retryMs);
		}
	};

	const scheduleWarmup = (framesLeft: number) => {
		if (cancelled) return;
		if (framesLeft <= 0) {
			tryScroll();
			return;
		}
		frameId = window.requestAnimationFrame(() => {
			scheduleWarmup(framesLeft - 1);
		});
	};

	scheduleWarmup(warmupFrames);

	return () => {
		cancelled = true;
		if (frameId !== null) window.cancelAnimationFrame(frameId);
		if (retryTimer !== null) window.clearTimeout(retryTimer);
	};
}
