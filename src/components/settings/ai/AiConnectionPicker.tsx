import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiProviderKind } from "../../../lib/tauri";
import { ChevronDown } from "../../Icons/NavigationIcons";
import { ProviderLogo } from "../../ai/modelSelectorConstants";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../ui/shadcn/popover";
import { SettingsRow } from "../SettingsScaffold";
import { SettingsSegmentedPicker } from "../SettingsSegmentedPicker";

type AiConnectionType = "agents" | "local" | "api";

interface AiProviderOption {
	value: AiProviderKind;
	label: string;
}

interface AiConnectionOption {
	value: AiConnectionType;
	providers: readonly AiProviderOption[];
}

const CONNECTION_OPTIONS = [
	{
		value: "agents",
		providers: [
			{ value: "codex_chatgpt", label: "Codex" },
			{ value: "opencode", label: "OpenCode" },
			{ value: "amp", label: "Amp" },
			{ value: "claude_code", label: "Claude Code" },
			{ value: "pi", label: "PI" },
		],
	},
	{
		value: "local",
		providers: [
			{ value: "ollama", label: "Ollama" },
			{ value: "llama_cpp", label: "llama.cpp" },
		],
	},
	{
		value: "api",
		providers: [
			{ value: "openai", label: "OpenAI" },
			{ value: "anthropic", label: "Anthropic" },
			{ value: "gemini", label: "Google" },
			{ value: "openrouter", label: "OpenRouter" },
			{ value: "openai_compat", label: "OpenAI compatible" },
		],
	},
] as const satisfies readonly AiConnectionOption[];

function connectionForProvider(provider: AiProviderKind): AiConnectionOption {
	return (
		CONNECTION_OPTIONS.find((option) =>
			option.providers.some((candidate) => candidate.value === provider),
		) ?? CONNECTION_OPTIONS[0]
	);
}

function connectionForType(type: AiConnectionType): AiConnectionOption {
	return (
		CONNECTION_OPTIONS.find((option) => option.value === type) ??
		CONNECTION_OPTIONS[0]
	);
}

function ConnectionPreview({ option }: { option: AiConnectionOption }) {
	return (
		<span className="aiConnectionPreview" aria-hidden="true">
			{option.providers.slice(0, 3).map((provider) => (
				<span
					key={provider.value}
					className="aiConnectionPreviewLogo"
					data-provider={provider.value}
					aria-hidden="true"
				>
					<ProviderLogo
						provider={provider.value}
						className="aiConnectionPreviewLogoImage"
					/>
				</span>
			))}
		</span>
	);
}

function ProviderIdentity({ option }: { option: AiProviderOption }) {
	return (
		<>
			<span
				className="aiProviderDropdownLogo"
				data-provider={option.value}
				aria-hidden="true"
			>
				<ProviderLogo
					provider={option.value}
					className="aiProviderDropdownLogoImage"
				/>
			</span>
			<span className="appearanceThemeDropdownTitle">{option.label}</span>
		</>
	);
}

interface AiConnectionPickerProps {
	provider: AiProviderKind;
	onProviderChange: (provider: AiProviderKind) => Promise<void>;
}

export function AiConnectionPicker({
	provider,
	onProviderChange,
}: AiConnectionPickerProps) {
	const { t } = useTranslation("settings.ai");
	const [providerMenuOpen, setProviderMenuOpen] = useState(false);
	const connection = connectionForProvider(provider);
	const selectedProvider =
		connection.providers.find((option) => option.value === provider) ??
		connection.providers[0];
	const pickerOptions = CONNECTION_OPTIONS.map((option) => ({
		value: option.value,
		label: t(`connection.types.${option.value}.label`),
		description: t(`connection.types.${option.value}.description`),
	}));

	return (
		<>
			<SettingsRow
				label={t("connection.type.label")}
				description={t("connection.type.description")}
				interactive={false}
			>
				<SettingsSegmentedPicker
					name="settings-ai-connection"
					ariaLabel={t("connection.type.ariaLabel")}
					value={connection.value}
					options={pickerOptions}
					onChange={(next) => {
						void onProviderChange(connectionForType(next).providers[0].value);
					}}
					renderPreview={(value) => (
						<ConnectionPreview option={connectionForType(value)} />
					)}
				/>
			</SettingsRow>

			<SettingsRow
				label={t("connection.provider.label")}
				description={t(
					`connection.types.${connection.value}.providerDescription`,
				)}
				interactive={false}
			>
				<Popover open={providerMenuOpen} onOpenChange={setProviderMenuOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className={cn(
								"appearanceThemeDropdownTrigger",
								providerMenuOpen && "is-open",
							)}
							aria-expanded={providerMenuOpen}
						>
							<span className="appearanceThemeDropdownLeading">
								<ProviderIdentity option={selectedProvider} />
							</span>
							<span
								className={cn(
									"appearanceThemeDropdownChevron",
									providerMenuOpen && "is-open",
								)}
								aria-hidden="true"
							>
								<ChevronDown size="var(--icon-md)" />
							</span>
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="center"
						side="bottom"
						sideOffset={8}
						collisionPadding={16}
						className="appearanceThemeDropdownContent aiProviderDropdownContent"
					>
						<div className="appearanceThemeDropdownHeader">
							<div className="appearanceThemeDropdownHeaderTitle">
								{t(`connection.types.${connection.value}.label`)}
							</div>
							<div className="appearanceThemeDropdownHeaderHint">
								{t(`connection.types.${connection.value}.description`)}
							</div>
						</div>
						<div className="appearanceThemeDropdownList">
							{connection.providers.map((option) => {
								const isSelected = option.value === provider;
								return (
									<button
										key={option.value}
										type="button"
										className={cn(
											"appearanceThemeDropdownOption",
											isSelected && "is-selected",
										)}
										onClick={() => {
											void onProviderChange(option.value);
											setProviderMenuOpen(false);
										}}
										aria-pressed={isSelected}
									>
										<span className="appearanceThemeDropdownOptionLead">
											<ProviderIdentity option={option} />
										</span>
									</button>
								);
							})}
						</div>
					</PopoverContent>
				</Popover>
			</SettingsRow>
		</>
	);
}
