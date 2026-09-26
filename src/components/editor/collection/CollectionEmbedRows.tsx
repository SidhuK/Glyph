import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { navigationQueryKeys } from "../../../lib/navigationPrefetch";
import { invoke } from "../../../lib/tauri";
import { dispatchMarkdownLinkClick } from "../markdown/editorEvents";
import type { CollectionReference } from "./collectionReference";

const PAGE_SIZE = 30;

type CollectionEmbedRowsProps = Pick<CollectionReference, "databaseId" | "viewId">;

function openCollectionNote(path: string) {
	const href = `/${path.split("/").map(encodeURIComponent).join("/")}`;
	dispatchMarkdownLinkClick({ href, sourcePath: "" });
}

export function CollectionEmbedRows({ databaseId, viewId }: CollectionEmbedRowsProps) {
	const { t } = useTranslation("editor");
	const [offset, setOffset] = useState(0);
	const rows = useQuery({
		queryKey: [
			...navigationQueryKeys.databaseRowsPages(databaseId, viewId, PAGE_SIZE),
			"embed",
			offset,
		],
		queryFn: () =>
			invoke("databases_query_rows", {
				database_id: databaseId,
				view_id: viewId,
				offset,
				limit: PAGE_SIZE,
			}),
	});
	// Live changes can remove the current page. Keep pagination within the result set.
	if (rows.isSuccess && offset > 0 && offset >= rows.data.total_count) {
		setOffset(Math.max(0, Math.ceil(rows.data.total_count / PAGE_SIZE) - 1) * PAGE_SIZE);
	}
	const nextOffset = rows.data?.next_offset;
	return (
		<>
			{rows.isPending ? <p role="status">{t("collectionEmbed.loading")}</p> : null}
			{rows.error ? (
				<p role="alert">
					{extractErrorMessage(rows.error)}{" "}
					<button type="button" onClick={() => void rows.refetch()}>
						{t("collectionEmbed.retry")}
					</button>
				</p>
			) : null}
			{rows.isSuccess ? (
				<>
					{rows.data.rows.length === 0 ? <p>{t("collectionEmbed.empty")}</p> : null}
					<ul className="collectionEmbedRows">
						{rows.data.rows.map((row) => (
							<li key={row.note_path}>
								<button type="button" onClick={() => openCollectionNote(row.note_path)}>
									<span>{row.title}</span>
									<small>{row.note_path}</small>
								</button>
							</li>
						))}
					</ul>
					<p role="status">{t("collectionEmbed.count", { count: rows.data.total_count })}</p>
				</>
			) : null}
			<div className="collectionEmbedPagination">
				{offset > 0 ? (
					<button
						type="button"
						onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
					>
						{t("collectionEmbed.previous")}
					</button>
				) : null}
				{nextOffset != null && rows.isSuccess ? (
					<button type="button" onClick={() => setOffset(nextOffset)}>
						{t("collectionEmbed.next")}
					</button>
				) : null}
			</div>
		</>
	);
}
