import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { NativeContextMenuEvent } from "../../lib/nativeContextMenu";

const FOLIO_MORE_MENU_OFFSET_PX = 4;

function keepKeysOutOfList(event: KeyboardEvent) {
	if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
	event.stopPropagation();
}

export function FolioNoteMoreButton({
	onOpenMenu,
}: {
	onOpenMenu: (event: NativeContextMenuEvent) => void;
}) {
	const { t } = useTranslation("shell");
	return (
		<button
			type="button"
			className="folioNoteMoreButton"
			title={t("folio.noteActions")}
			aria-label={t("folio.noteActions")}
			aria-haspopup="menu"
			onKeyDown={keepKeysOutOfList}
			onClick={(event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				onOpenMenu({
					clientX: rect.left,
					clientY: rect.bottom + FOLIO_MORE_MENU_OFFSET_PX,
					preventDefault: () => event.preventDefault(),
					stopPropagation: () => event.stopPropagation(),
				});
			}}
		>
			<HugeiconsIcon icon={MoreHorizontalIcon} size="var(--icon-md)" aria-hidden="true" />
		</button>
	);
}
