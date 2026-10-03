import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts/SpaceContext";

const RecoveryDialog = lazy(() => import("./RecoveryDialog"));

export function RecoveryButton({ path = null }: { path?: string | null }) {
	const { t } = useTranslation("editor");
	const { spacePath } = useSpace();
	const [open, setOpen] = useState(false);
	if (!spacePath) return null;
	return (
		<>
			<button type="button" className="markdownEditorInfoTab" onClick={() => setOpen(true)}>
				{t("recovery.title")}
			</button>
			{open ? (
				<Suspense fallback={<span role="status">{t("recovery.loading")}</span>}>
					<RecoveryDialog
						key={spacePath}
						spacePath={spacePath}
						initialPath={path}
						onClose={() => setOpen(false)}
					/>
				</Suspense>
			) : null}
		</>
	);
}
