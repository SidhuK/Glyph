import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UseDatabasesPaneReturn } from "../../hooks/database/useDatabasesPane";
import { Input } from "../ui/shadcn/input";

interface CollectionTitleProps {
	document: Pick<
		UseDatabasesPaneReturn["document"],
		"nameDraft" | "setNameDraft" | "commitDatabaseRename"
	>;
}

/** The collection's page title above its view tabs, renamed in place like a note title. */
export function CollectionTitle({ document: doc }: CollectionTitleProps) {
	const { t } = useTranslation("shell");
	const skipNextBlurCommitRef = useRef(false);

	return (
		<div className="databasesTitleRow">
			<Input
				value={doc.nameDraft}
				className="plainTextInput databasesCollectionTitleInput"
				aria-label={t("collections.nameLabel")}
				style={{
					width: `${Math.min(Math.max(doc.nameDraft.trim().length + 1, 10), 36)}ch`,
				}}
				onChange={(event) => doc.setNameDraft(event.target.value)}
				onBlur={() => {
					if (skipNextBlurCommitRef.current) {
						skipNextBlurCommitRef.current = false;
						return;
					}
					doc.commitDatabaseRename();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						skipNextBlurCommitRef.current = true;
						doc.commitDatabaseRename();
						event.currentTarget.blur();
					}
				}}
			/>
		</div>
	);
}
