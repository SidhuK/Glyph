import { type MutableRefObject, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "../Icons";

/** Within this many pixels of the end, the board counts as scrolled all the way. */
const BOARD_SCROLL_END_SLACK_PX = 2;

function hasLanesPastEdge(element: HTMLElement): boolean {
	return element.scrollLeft + element.clientWidth < element.scrollWidth - BOARD_SCROLL_END_SLACK_PX;
}

/**
 * Tracks whether lanes sit past the board's right edge and scrolls one lane on. The returned
 * ref callback also fills `boardScrollRef`, so other hooks keep reading the same element.
 */
export function useBoardScrollNext(boardScrollRef: MutableRefObject<HTMLDivElement | null>) {
	const [canScrollNext, setCanScrollNext] = useState(false);

	const setBoardScrollElement = useCallback(
		(element: HTMLDivElement | null) => {
			boardScrollRef.current = element;
			if (!element) return;
			const update = () => setCanScrollNext(hasLanesPastEdge(element));
			update();
			const observer = new ResizeObserver(update);
			observer.observe(element);
			if (element.firstElementChild) observer.observe(element.firstElementChild);
			return () => {
				observer.disconnect();
				boardScrollRef.current = null;
			};
		},
		[boardScrollRef],
	);

	const onBoardScroll = useCallback((element: HTMLElement) => {
		setCanScrollNext(hasLanesPastEdge(element));
	}, []);

	return { canScrollNext, setBoardScrollElement, onBoardScroll };
}

/** The edge control over the trailing fade: one click brings the next lane fully into view. */
export function DatabaseBoardScrollNext({
	boardScrollRef,
	reduceMotion,
}: {
	boardScrollRef: MutableRefObject<HTMLDivElement | null>;
	reduceMotion: boolean | null;
}) {
	const { t } = useTranslation("shell");
	const label = t("collections.board.scrollNext");

	return (
		<button
			type="button"
			className="databaseBoardScrollNext"
			aria-label={label}
			title={label}
			onClick={() => {
				const element = boardScrollRef.current;
				const [first, second] = element?.querySelectorAll(".databaseBoardLane") ?? [];
				if (!element || !first || !second) return;
				element.scrollBy({
					left: second.getBoundingClientRect().left - first.getBoundingClientRect().left,
					behavior: reduceMotion ? "auto" : "smooth",
				});
			}}
		>
			<ChevronRight size="var(--icon-md)" aria-hidden="true" />
		</button>
	);
}
