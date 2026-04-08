const DEFAULT_COPY_LABEL = "Copy command";
const COPIED_COPY_LABEL = "Copied";
const FAILED_COPY_LABEL = "Copy failed";

export function initHamburger(): void {
	const hamburger =
		document.querySelector<HTMLButtonElement>("[data-hamburger]");
	const mobileNav = document.querySelector<HTMLDivElement>("[data-mobile-nav]");

	if (!hamburger || !mobileNav) return;

	hamburger.addEventListener("click", () => {
		const isOpen = mobileNav.classList.toggle("is-open");
		hamburger.setAttribute("aria-expanded", String(isOpen));
	});

	for (const link of mobileNav.querySelectorAll("a")) {
		link.addEventListener("click", () => {
			mobileNav.classList.remove("is-open");
			hamburger.setAttribute("aria-expanded", "false");
		});
	}
}

export function initRevealAnimation(): void {
	const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;

	if (prefersReducedMotion || !("IntersectionObserver" in window)) {
		for (const el of revealItems) {
			el.classList.add("revealed");
		}
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.remove("reveal-pending");
					entry.target.classList.add("revealed");
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.1 },
	);

	for (const el of revealItems) {
		const rect = el.getBoundingClientRect();
		if (rect.top <= window.innerHeight * 0.92) {
			el.classList.add("revealed");
			return;
		}

		el.classList.add("reveal-pending");
		observer.observe(el);
	}
}

export function initModeToggle(): void {
	const toggle =
		document.querySelector<HTMLButtonElement>("[data-mode-toggle]");
	const showcase = toggle?.closest<HTMLDivElement>(".showcase");
	const showcaseImage =
		showcase?.querySelector<HTMLImageElement>(".showcase-img");

	if (!toggle || !showcase || !showcaseImage) return;

	let isDarkMode = false;

	const setShowcaseMode = (darkMode: boolean): void => {
		const nextSrc = darkMode
			? showcaseImage.dataset.darkSrc
			: showcaseImage.dataset.lightSrc;
		const nextAlt = darkMode
			? showcaseImage.dataset.darkAlt
			: showcaseImage.dataset.lightAlt;

		if (nextSrc) showcaseImage.src = nextSrc;
		showcaseImage.removeAttribute("srcset");
		if (nextAlt) showcaseImage.alt = nextAlt;

		showcase.classList.toggle("is-dark", darkMode);
		toggle.setAttribute("aria-pressed", String(darkMode));
	};

	toggle.addEventListener("click", () => {
		isDarkMode = !isDarkMode;
		setShowcaseMode(isDarkMode);
	});
}

export function initClipboard(): void {
	const copyButton = document.querySelector<HTMLButtonElement>(
		"[data-copy-install]",
	);
	const installStrip = document.querySelector<HTMLDivElement>(
		"[data-install-strip]",
	);
	const installCommand = document
		.querySelector("[data-install-command]")
		?.textContent?.trim();

	if (!copyButton || !installStrip) return;

	let copyResetTimer: number | undefined;

	copyButton.addEventListener("click", async () => {
		if (!installCommand) return;

		installStrip.classList.remove("is-copied", "is-failed", "is-typing");
		copyButton.classList.remove("is-copied", "is-failed");
		installStrip.classList.add("is-typing");

		window.clearTimeout(copyResetTimer);

		try {
			await navigator.clipboard.writeText(installCommand);
			window.setTimeout(() => {
				installStrip.classList.remove("is-typing");
				installStrip.classList.add("is-copied");
				copyButton.classList.add("is-copied");
				copyButton.classList.remove("is-failed");
				copyButton.setAttribute("aria-label", COPIED_COPY_LABEL);
				copyButton.setAttribute("title", COPIED_COPY_LABEL);
			}, 180);

			copyResetTimer = window.setTimeout(() => {
				installStrip.classList.remove("is-typing", "is-copied");
				copyButton.classList.remove("is-copied");
				copyButton.setAttribute("aria-label", DEFAULT_COPY_LABEL);
				copyButton.setAttribute("title", DEFAULT_COPY_LABEL);
			}, 1900);
		} catch {
			installStrip.classList.remove("is-typing");
			installStrip.classList.add("is-failed");
			copyButton.classList.add("is-failed");
			copyButton.setAttribute("aria-label", FAILED_COPY_LABEL);
			copyButton.setAttribute("title", FAILED_COPY_LABEL);

			copyResetTimer = window.setTimeout(() => {
				installStrip.classList.remove("is-failed");
				copyButton.classList.remove("is-failed");
				copyButton.setAttribute("aria-label", DEFAULT_COPY_LABEL);
				copyButton.setAttribute("title", DEFAULT_COPY_LABEL);
			}, 2200);
		}
	});
}
