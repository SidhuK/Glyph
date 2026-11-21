import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseConfig } from "../../lib/tauri";

type CollectionLayout = DatabaseConfig["view"]["layout"];

interface LayoutTile {
	layout: CollectionLayout;
	label: string;
	hint: string;
	art: ReactNode;
}

const BOARD_ART_LANES = [2, 1, 3] as const;
const TABLE_ART_ROWS = 4;

function BoardArt() {
	return (
		<span className="collectionLayoutTileArt is-board" aria-hidden="true">
			{BOARD_ART_LANES.map((cards, lane) => (
				<span key={lane} className="collectionLayoutTileLane">
					{Array.from({ length: cards }, (_, card) => (
						<i key={card} />
					))}
				</span>
			))}
		</span>
	);
}

function TableArt() {
	return (
		<span className="collectionLayoutTileArt is-table" aria-hidden="true">
			{Array.from({ length: TABLE_ART_ROWS }, (_, row) => (
				<i key={row} />
			))}
		</span>
	);
}

interface CollectionLayoutTilesProps {
	value: CollectionLayout;
	onChange: (layout: CollectionLayout) => void;
}

export function CollectionLayoutTiles({ value, onChange }: CollectionLayoutTilesProps) {
	const { t } = useTranslation("shell");
	const tiles: LayoutTile[] = [
		{
			layout: "board",
			label: t("collections.viewMenu.board"),
			hint: t("collections.creator.boardHint"),
			art: <BoardArt />,
		},
		{
			layout: "table",
			label: t("collections.viewMenu.table"),
			hint: t("collections.creator.tableHint"),
			art: <TableArt />,
		},
	];

	return (
		<div
			className="collectionLayoutTiles"
			role="radiogroup"
			aria-label={t("collections.viewMenu.viewType")}
		>
			{tiles.map((tile) => (
				<button
					key={tile.layout}
					type="button"
					role="radio"
					aria-checked={value === tile.layout}
					className="collectionLayoutTile"
					onClick={() => onChange(tile.layout)}
				>
					{tile.art}
					<span className="collectionLayoutTileLabel">{tile.label}</span>
					<span className="collectionLayoutTileHint">{tile.hint}</span>
				</button>
			))}
		</div>
	);
}
