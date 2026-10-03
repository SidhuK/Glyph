import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../contexts/UIContext";
import { formatDisplayDate, formatLocalClockTime } from "../../lib/dateDisplayFormat";
import { Button } from "../ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/shadcn/dialog";
import { RecoveryPreview } from "./RecoveryPreview";
import { useRecoveryDialog } from "./useRecoveryDialog";

type RecoveryDialogProps = Parameters<typeof useRecoveryDialog>[0];

export default function RecoveryDialog(props: RecoveryDialogProps) {
	const { t } = useTranslation("editor");
	const dateFormat = useDateDisplayFormat();
	const scrollRef = useRef<HTMLDivElement>(null);
	const {
		path,
		selectedId,
		setSelectedId,
		deletedOnly,
		setDeletedOnly,
		search,
		setSearch,
		history,
		preview,
		restore,
		snapshots,
		errorMessage,
		navigate,
	} = useRecoveryDialog(props);
	const selectedPreview = preview.data;
	const unchanged =
		selectedPreview?.current.kind === "present" &&
		selectedPreview.current.text === selectedPreview.text;
	const virtualizer = useVirtualizer({
		count: snapshots.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 56,
		getItemKey: (index) => snapshots[index]?.id ?? index,
		overscan: 5,
	});

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !restore.isPending) props.onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-5xl max-h-[90vh] overflow-auto"
				showCloseButton={!restore.isPending}
			>
				<DialogTitle>{t("recovery.title")}</DialogTitle>
				<DialogDescription>{t("recovery.description")}</DialogDescription>
				<div className="flex flex-wrap items-center gap-3">
					{path ? (
						<Button variant="outline" disabled={restore.isPending} onClick={() => navigate(null)}>
							{t("recovery.allNotes")}
						</Button>
					) : null}
					<strong className="min-w-0 truncate">{path ?? t("recovery.allNotes")}</strong>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={deletedOnly}
							disabled={restore.isPending}
							onChange={(event) => {
								setDeletedOnly(event.target.checked);
								setSelectedId(null);
								restore.reset();
							}}
						/>
						{t("recovery.deletedOnly")}
					</label>
					<Button
						variant="outline"
						disabled={restore.isPending || preview.isFetching}
						onClick={() => {
							restore.reset();
							void history.refetch();
							if (selectedId !== null) void preview.refetch();
						}}
					>
						{t("recovery.refresh")}
					</Button>
				</div>
				<input
					className="rounded border p-2"
					aria-label={t("recovery.search")}
					placeholder={t("recovery.search")}
					value={search}
					disabled={restore.isPending}
					onChange={(event) => setSearch(event.target.value)}
				/>
				{history.isPending || preview.isFetching ? (
					<p role="status">{t("recovery.loading")}</p>
				) : null}
				{errorMessage ? (
					<p role="alert">{t("recovery.failed", { message: errorMessage })}</p>
				) : null}
				{!history.isPending && !history.error && snapshots.length === 0 ? (
					<p>{t("recovery.empty")}</p>
				) : null}
				<div
					ref={scrollRef}
					className="h-48 overflow-auto rounded border"
					aria-label={t("recovery.versions")}
				>
					<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
						{virtualizer.getVirtualItems().map((item) => {
							const snapshot = snapshots[item.index];
							if (!snapshot) return null;
							const date = new Date(snapshot.timestamp_ms);
							return (
								<button
									key={item.key}
									type="button"
									className="absolute left-0 top-0 flex w-full flex-col items-start px-3 py-2 text-left hover:bg-accent aria-pressed:bg-accent"
									style={{ height: item.size, transform: `translateY(${item.start}px)` }}
									disabled={restore.isPending}
									aria-pressed={selectedId === snapshot.id}
									onClick={() => {
										restore.reset();
										if (!path) navigate(snapshot.path);
										else setSelectedId(snapshot.id);
									}}
								>
									<span className="w-full truncate">
										{snapshot.path}
										{snapshot.deleted ? ` · ${t("recovery.deleted")}` : ""}
									</span>
									<small>
										{formatDisplayDate(date, dateFormat, { time: formatLocalClockTime(date) })}
									</small>
								</button>
							);
						})}
					</div>
				</div>
				{selectedPreview && selectedId !== null ? (
					<>
						<RecoveryPreview preview={selectedPreview} />
						<Button
							disabled={restore.isPending || preview.isFetching || preview.isError || unchanged}
							onClick={() => restore.mutate(selectedPreview)}
						>
							{restore.isPending ? t("recovery.restoring") : t("recovery.restore")}
						</Button>
					</>
				) : (
					<p>{t("recovery.selectVersion")}</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
