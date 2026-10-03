import { Audit02Icon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { Button } from "../ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/shadcn/dialog";

const TaskInbox = lazy(() => import("./TaskInbox"));

export function TaskInboxButton({ onOpenNote }: { onOpenNote: (path: string) => void }) {
	const { t } = useTranslation("shell");
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				className="sidebarQuickActionBtn sidebarNavBtn"
				onClick={() => setOpen(true)}
			>
				<HugeiconsIcon icon={Audit02Icon} size="var(--icon-md)" />
				<span className="sidebarQuickActionLabel">{t("taskInbox.title")}</span>
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
					showCloseButton={false}
				>
					<div className="flex items-center justify-between">
						<DialogTitle>{t("taskInbox.title")}</DialogTitle>
						<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
							{t("taskInbox.close")}
						</Button>
					</div>
					<DialogDescription>{t("taskInbox.description")}</DialogDescription>
					{open ? (
						<Suspense fallback={<p>{t("taskInbox.loading")}</p>}>
							<TaskInbox
								onOpenNote={(path) => {
									setOpen(false);
									onOpenNote(path);
								}}
							/>
						</Suspense>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
