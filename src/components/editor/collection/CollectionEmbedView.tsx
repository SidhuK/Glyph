import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../../lib/errorUtils";
import {
	databaseDocumentQueryOptions,
	databaseSummariesQueryOptions,
} from "../../../lib/navigationPrefetch";
import { CollectionEmbedRows } from "./CollectionEmbedRows";
import type { CollectionReference } from "./collectionReference";

interface CollectionEmbedViewProps {
	reference: CollectionReference;
	editable: boolean;
	onChange: (reference: CollectionReference) => void;
	onRemove: () => void;
}

export default function CollectionEmbedView({
	reference,
	editable,
	onChange,
	onRemove,
}: CollectionEmbedViewProps) {
	const { t } = useTranslation("editor");
	const { databaseId, viewId } = reference;
	const summaries = useQuery(databaseSummariesQueryOptions());
	const document = useQuery(databaseDocumentQueryOptions(databaseId));
	const views = document.data?.database.views ?? [];
	const selectedView = views.find((view) => view.id === viewId);
	const error = summaries.error ?? document.error;
	return (
		<section aria-label={t("collectionEmbed.title")}>
			<div className="collectionEmbedHeader">
				<strong>{t("collectionEmbed.title")}</strong>
				{editable ? (
					<button type="button" onClick={onRemove}>
						{t("collectionEmbed.remove")}
					</button>
				) : null}
			</div>
			<div className="collectionEmbedSelectors">
				<label>
					{t("collectionEmbed.collection")}
					<select
						disabled={!editable}
						value={databaseId}
						onChange={(event) =>
							onChange({ ...reference, databaseId: event.currentTarget.value, viewId: "" })
						}
					>
						<option value="">{t("collectionEmbed.chooseCollection")}</option>
						{databaseId && !summaries.data?.some((item) => item.id === databaseId) ? (
							<option value={databaseId}>
								{document.data?.database.name ?? t("collectionEmbed.unavailable")}
							</option>
						) : null}
						{summaries.data?.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</label>
				<label>
					{t("collectionEmbed.view")}
					<select
						disabled={!editable || !document.data || Boolean(document.error)}
						value={viewId}
						onChange={(event) => onChange({ ...reference, viewId: event.currentTarget.value })}
					>
						<option value="">{t("collectionEmbed.chooseView")}</option>
						{viewId && !selectedView ? (
							<option value={viewId}>{t("collectionEmbed.unavailable")}</option>
						) : null}
						{views.map((view) => (
							<option key={view.id} value={view.id}>
								{view.name}
							</option>
						))}
					</select>
				</label>
			</div>
			<p>{t("collectionEmbed.help")}</p>
			{summaries.isPending || (databaseId && document.isPending) ? (
				<p role="status">{t("collectionEmbed.loading")}</p>
			) : null}
			{error ? (
				<p role="alert">
					{extractErrorMessage(error)}{" "}
					<button
						type="button"
						onClick={() => {
							void summaries.refetch();
							if (databaseId) void document.refetch();
						}}
					>
						{t("collectionEmbed.retry")}
					</button>
				</p>
			) : null}
			{viewId && document.data && !selectedView ? (
				<p role="alert">{t("collectionEmbed.unavailable")}</p>
			) : null}
			{databaseId && viewId && !document.error && (document.isPending || selectedView) ? (
				<CollectionEmbedRows
					key={JSON.stringify([databaseId, viewId])}
					databaseId={databaseId}
					viewId={viewId}
				/>
			) : null}
		</section>
	);
}
