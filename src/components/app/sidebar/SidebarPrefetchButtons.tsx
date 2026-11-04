import { useUILayoutContext } from "@/contexts";
import { useHoverPrefetch } from "@/hooks/useHoverPrefetch";
import type { SidebarVisibilityKey } from "@/lib/settings/model";
import {
	Files02Icon as AllNotesIcon,
	Database01Icon as CollectionsIcon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { AllNotesCountBadge, SidebarActionButton } from "./SidebarActionButton";

interface SidebarPrefetchButtonProps {
	"data-sidebar-key": SidebarVisibilityKey;
	active: boolean;
}

interface SidebarAllNotesButtonProps extends SidebarPrefetchButtonProps {
	onOpenAllDocs: () => void;
	onPrefetchAllDocs: () => void;
}

/** All notes, with its count; hovering or focusing it warms the all-notes query. */
export function SidebarAllNotesButton({
	"data-sidebar-key": sidebarKey,
	active,
	onOpenAllDocs,
	onPrefetchAllDocs,
}: SidebarAllNotesButtonProps) {
	const { t } = useTranslation("shell");
	const { folioMode, setFolioScope } = useUILayoutContext();
	const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(onPrefetchAllDocs);

	const handleOpenAllNotes = () => {
		cancelHoverPrefetch();
		onOpenAllDocs();
		if (!folioMode) return;
		setFolioScope({ kind: "all" });
		onPrefetchAllDocs();
	};

	return (
		<SidebarActionButton
			data-sidebar-key={sidebarKey}
			badge={<AllNotesCountBadge />}
			label={t("sidebar.allNotes")}
			icon={AllNotesIcon}
			onClick={handleOpenAllNotes}
			active={active}
			{...hoverPrefetchProps}
			onFocus={onPrefetchAllDocs}
		/>
	);
}

interface SidebarCollectionsButtonProps extends SidebarPrefetchButtonProps {
	onOpenDatabases: () => void;
	onPrefetchDatabases: () => void;
}

/** Collections; hovering or focusing it warms the collections query. */
export function SidebarCollectionsButton({
	"data-sidebar-key": sidebarKey,
	active,
	onOpenDatabases,
	onPrefetchDatabases,
}: SidebarCollectionsButtonProps) {
	const { t } = useTranslation("shell");
	// The prefetch takes an optional collection id, so never hand it an event.
	const prefetchCollections = () => onPrefetchDatabases();
	const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(prefetchCollections);

	return (
		<SidebarActionButton
			data-sidebar-key={sidebarKey}
			label={t("sidebar.collections")}
			icon={CollectionsIcon}
			onClick={() => {
				cancelHoverPrefetch();
				onOpenDatabases();
			}}
			active={active}
			{...hoverPrefetchProps}
			onFocus={prefetchCollections}
		/>
	);
}
