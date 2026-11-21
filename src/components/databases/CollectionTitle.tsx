import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UseDatabasesPaneReturn } from "../../hooks/database/useDatabasesPane";
import { Input } from "../ui/shadcn/input";

interface CollectionTitleProps {
	document: Pick<
		UseDatabasesPaneReturn["document"],
		"document" | "nameDraft" | "setNameDraft" | "commitDatabaseRename"
	>;
}

function titleInputWidth(name: string): string {
	return `${Math.min(Math.max(name.trim().length + 1, 10), 36)}ch`;
}

export function CollectionTitle({ document: doc }: CollectionTitleProps) {
	const { t } = useTranslation("shell");
	const [renaming, setRenaming] = useState(false);
	const skipNextBlurCommitRef = useRef(false);
	const savedName = doc.document?.database.name ?? doc.nameDraft;

	const startRename = () => {
		skipNextBlurCommitRef.current = false;
		doc.setNameDraft(savedName);
		setRenaming(true);
	};

	const finishRename = (commit: boolean) => {
		skipNextBlurCommitRef.current = true;
		if (commit) {
			doc.commitDatabaseRename();
		} else {
			doc.setNameDraft(savedName);
		}
		setRenaming(false);
	};

	if (!renaming) {
		return (
			<div className="databasesTitleRow">
				<h1
					className="databasesCollectionTitle"
					title={t("collections.renameHint")}
					tabIndex={0}
					onDoubleClick={startRename}
					onKeyDown={(event) => {
						if (event.key !== "Enter") return;
						event.preventDefault();
						startRename();
					}}
				>
					{savedName}
				</h1>
			</div>
		);
	}

	return (
		<div className="databasesTitleRow">
			<Input
				autoFocus
				value={doc.nameDraft}
				className="plainTextInput databasesCollectionTitle"
				aria-label={t("collections.nameLabel")}
				style={{ width: titleInputWidth(doc.nameDraft) }}
				onFocus={(event) => event.currentTarget.select()}
				onChange={(event) => doc.setNameDraft(event.target.value)}
				onBlur={() => {
					if (skipNextBlurCommitRef.current) return;
					finishRename(true);
				}}
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing) return;
					if (event.key === "Enter") {
						event.preventDefault();
						finishRename(true);
					}
					if (event.key === "Escape") {
						event.preventDefault();
						finishRename(false);
					}
				}}
			/>
		</div>
	);
}
