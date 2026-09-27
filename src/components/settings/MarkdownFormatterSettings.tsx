import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type MarkdownFormatterSettings as FormatterSettings,
	isMarkdownFormatterSettings,
	normalizeMarkdownFormatter,
} from "../../lib/markdownFormatter";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { getSettingsStore } from "../../lib/settingsStore";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";

type FormatterDraft = Omit<FormatterSettings, "version" | "arguments" | "executable"> & {
	executable: string;
	argumentsText: string;
};

const QUERY_KEY = ["settings", "markdown-formatter"] as const;

export function MarkdownFormatterSettings() {
	const { t } = useTranslation("settings.general");
	const client = useQueryClient();
	const query = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const store = await getSettingsStore();
			const value = await store.get<unknown>(DURABLE_SETTINGS.editorMarkdownFormatter.key);
			return normalizeMarkdownFormatter(value);
		},
	});
	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				if (payload.editor?.markdownFormatter !== undefined) {
					void client.invalidateQueries({ queryKey: QUERY_KEY });
				}
			},
			[client],
		),
	);
	return (
		<SettingsSection title={t("formatter.title")} description={t("formatter.description")}>
			{query.error ? <div role="alert">{t("formatter.loadFailed")}</div> : null}
			{query.data ? <FormatterForm key={JSON.stringify(query.data)} initial={query.data} /> : null}
		</SettingsSection>
	);
}

function FormatterForm({ initial }: { initial: FormatterSettings }) {
	const { t } = useTranslation("settings.general");
	const client = useQueryClient();
	const [draft, setDraft] = useState<FormatterDraft>(() => ({
		enabled: initial.enabled,
		executable: initial.executable,
		configFile: initial.configFile,
		argumentsText: JSON.stringify(initial.arguments),
	}));
	const mutation = useMutation({
		mutationFn: async () => {
			let args: unknown;
			try {
				args = JSON.parse(draft.argumentsText);
			} catch {
				throw new Error(t("formatter.invalidArguments"));
			}
			const value = {
				version: 1,
				enabled: draft.enabled,
				executable: draft.executable.trim(),
				configFile: draft.configFile.trim(),
				arguments: args,
			};
			if (!isMarkdownFormatterSettings(value)) {
				throw new Error(t("formatter.invalidSettings"));
			}
			await DURABLE_SETTINGS.editorMarkdownFormatter.write(value);
			return value;
		},
		onSuccess: (value) => {
			client.setQueryData(QUERY_KEY, value);
		},
	});
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				mutation.mutate();
			}}
		>
			<SettingsRow label={t("formatter.enabled")} searchId="general-editor-markdown-formatter">
				<SettingsToggle
					checked={draft.enabled}
					disabled={mutation.isPending}
					ariaLabel={t("formatter.enabled")}
					onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("formatter.executable")}
				htmlFor="formatter-executable"
				description={t("formatter.executableHelp")}
			>
				<Input
					id="formatter-executable"
					value={draft.executable}
					disabled={mutation.isPending}
					onChange={(event) => {
						const executable = event.currentTarget.value;
						setDraft((current) => ({ ...current, executable }));
					}}
					spellCheck={false}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("formatter.arguments")}
				htmlFor="formatter-arguments"
				description={t("formatter.argumentsHelp")}
			>
				<Input
					id="formatter-arguments"
					value={draft.argumentsText}
					disabled={mutation.isPending}
					onChange={(event) => {
						const argumentsText = event.currentTarget.value;
						setDraft((current) => ({ ...current, argumentsText }));
					}}
					spellCheck={false}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("formatter.configFile")}
				htmlFor="formatter-config"
				description={t("formatter.configHelp")}
			>
				<Input
					id="formatter-config"
					value={draft.configFile}
					disabled={mutation.isPending}
					onChange={(event) => {
						const configFile = event.currentTarget.value;
						setDraft((current) => ({ ...current, configFile }));
					}}
					spellCheck={false}
				/>
			</SettingsRow>
			<div className="settingsActions">
				<Button type="submit" variant="outline" disabled={mutation.isPending}>
					{t("formatter.save")}
				</Button>
			</div>
			{mutation.error ? (
				<div className="settingsError" role="alert">
					{mutation.error.message}
				</div>
			) : null}
		</form>
	);
}
