import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useCallback, useEffect, useRef } from "react";
import { type GlyphDeepLink, parseGlyphDeepLink } from "../../lib/deeplinks";

export interface UseDeepLinksOptions {
	settingsLoaded: boolean;
	spacePath: string | null;
	onOpenDeepLink: (link: GlyphDeepLink) => void | Promise<void>;
	onError: (message: string) => void;
}

const needsOpenSpace = (link: GlyphDeepLink): boolean =>
	link.kind !== "settings";

export function useDeepLinks({
	settingsLoaded,
	spacePath,
	onOpenDeepLink,
	onError,
}: UseDeepLinksOptions): void {
	const pendingRef = useRef<GlyphDeepLink[]>([]);
	const seenRawUrlsRef = useRef(new Set<string>());
	const settingsLoadedRef = useRef(settingsLoaded);
	const spacePathRef = useRef(spacePath);
	const onOpenDeepLinkRef = useRef(onOpenDeepLink);
	const onErrorRef = useRef(onError);

	settingsLoadedRef.current = settingsLoaded;
	spacePathRef.current = spacePath;
	onOpenDeepLinkRef.current = onOpenDeepLink;
	onErrorRef.current = onError;

	const flushPending = useCallback(() => {
		if (!settingsLoadedRef.current) return;
		const pending = pendingRef.current;
		pendingRef.current = [];
		for (const link of pending) {
			if (needsOpenSpace(link) && !spacePathRef.current) {
				onErrorRef.current("Open a space before using this Glyph link.");
				continue;
			}
			void onOpenDeepLinkRef.current(link);
		}
	}, []);

	const handleUrls = useCallback(
		(urls: string[] | null) => {
			if (!urls?.length) return;
			for (const rawUrl of urls) {
				if (seenRawUrlsRef.current.has(rawUrl)) continue;
				seenRawUrlsRef.current.add(rawUrl);
				const link = parseGlyphDeepLink(rawUrl);
				if (!link) {
					onErrorRef.current("Glyph could not open that link.");
					continue;
				}
				pendingRef.current.push(link);
			}
			flushPending();
		},
		[flushPending],
	);

	useEffect(() => {
		let cancelled = false;
		let cleanup: (() => void) | null = null;

		void getCurrent()
			.then((urls) => {
				if (!cancelled) handleUrls(urls);
			})
			.catch(() => {
				// Deep links are best-effort during app startup.
			});

		void onOpenUrl((urls) => {
			handleUrls(urls);
		})
			.then((unlisten) => {
				if (cancelled) {
					unlisten();
					return;
				}
				cleanup = unlisten;
			})
			.catch(() => {
				// Some non-Tauri test/browser contexts cannot subscribe.
			});

		return () => {
			cancelled = true;
			cleanup?.();
		};
	}, [handleUrls]);

	useEffect(() => {
		flushPending();
	});
}
