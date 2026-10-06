import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GalleryCoverImage } from "../../../hooks/database/useGalleryCovers";
import type { DatabaseRow } from "../../../lib/database/types";

interface DatabaseGalleryCardProps {
	row: DatabaseRow;
	cover: GalleryCoverImage | null;
	showCover: boolean;
	coverHeight: number;
	selected: boolean;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
	children: ReactNode;
}

export function DatabaseGalleryCard({
	row,
	cover,
	showCover,
	coverHeight,
	selected,
	onSelectRow,
	onOpenRow,
	onContextMenu,
	children,
}: DatabaseGalleryCardProps) {
	const { t } = useTranslation("shell");
	const preview = row.preview?.trim();
	return (
		<button
			type="button"
			className="databaseBoardCard databaseGalleryCard"
			data-state={selected ? "selected" : undefined}
			title={t("collections.card.openHint")}
			onClick={() => onSelectRow(row.note_path)}
			onDoubleClick={() => onOpenRow(row.note_path)}
			onContextMenu={onContextMenu}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				onOpenRow(row.note_path);
			}}
		>
			{showCover ? (
				<div
					className="databaseGalleryCover"
					data-kind={cover?.kind ?? "preview"}
					style={{ height: coverHeight }}
				>
					{cover?.src ? (
						<img src={cover.src} alt="" loading="lazy" decoding="async" draggable={false} />
					) : preview ? (
						<p className="databaseGalleryPreview">{preview}</p>
					) : null}
				</div>
			) : null}
			<div className="databaseGalleryCardBody">{children}</div>
		</button>
	);
}
