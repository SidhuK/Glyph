import {
	AiChipIcon,
	Alert02Icon,
	InformationCircleIcon,
	Loading03Icon,
	RefreshIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { AiModel, AiProviderKind } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { ChevronDown } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import styles from "./ModelSelector.module.css";
import { ProviderLogo, providerLogoMap, resolveLogoProvider } from "./modelSelectorConstants";

const ROW_ICON_SIZE = "var(--icon-sm)";

function RowIcon({ icon }: { icon: IconSvgElement }) {
	return (
		<HugeiconsIcon
			icon={icon}
			size={ROW_ICON_SIZE}
			className="glyphMenuItemIcon"
			aria-hidden="true"
		/>
	);
}

interface ModelSelectorProps {
	profileId: string | null;
	value: string;
	onChange: (modelId: string) => void;
	provider: AiProviderKind | null;
}

export function ModelSelector({ profileId, value, onChange, provider }: ModelSelectorProps) {
	const { t } = useTranslation("shell");
	const modelsQuery = useQuery({
		queryKey: ["ai", "models", profileId, provider],
		queryFn: (): Promise<AiModel[]> => {
			if (!profileId) return Promise.resolve([]);
			return invoke("ai_models_list", { profile_id: profileId, provider });
		},
		enabled: profileId !== null,
	});
	const models = modelsQuery.data;
	const selectedModel = models?.find((model) => model.id === value);
	const displayLabel = selectedModel?.name || value || t("ai.modelSelector.label");
	const selectLabel = t("ai.modelSelector.select");
	const logoProvider = resolveLogoProvider(provider, selectedModel?.name);
	const providerTitle = logoProvider
		? (providerLogoMap[logoProvider]?.label ?? logoProvider)
		: t("ai.modelSelector.provider");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className={styles.trigger}
						title={value || selectLabel}
						aria-label={selectLabel}
						disabled={!profileId}
					/>
				}
			>
				{logoProvider && (
					<span className={styles.triggerLogo} title={providerTitle}>
						<ProviderLogo provider={logoProvider} className={styles.providerSvg} />
					</span>
				)}
				<span className={styles.triggerLabel}>{displayLabel}</span>
				<span className={styles.triggerIcon}>
					<ChevronDown size="var(--icon-sm)" />
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{modelsQuery.isPending ? (
					<DropdownMenuItem disabled>
						<RowIcon icon={Loading03Icon} />
						<span className="glyphMenuItemLabel">{t("ai.modelSelector.loading")}</span>
					</DropdownMenuItem>
				) : modelsQuery.isError ? (
					<>
						<DropdownMenuItem disabled title={extractErrorMessage(modelsQuery.error)}>
							<RowIcon icon={Alert02Icon} />
							<span className="glyphMenuItemLabel">{t("ai.modelSelector.loadFailed")}</span>
						</DropdownMenuItem>
						<DropdownMenuItem closeOnClick={false} onClick={() => void modelsQuery.refetch()}>
							<RowIcon icon={RefreshIcon} />
							<span className="glyphMenuItemLabel">{t("ai.modelSelector.retry")}</span>
						</DropdownMenuItem>
					</>
				) : !models?.length ? (
					<DropdownMenuItem disabled>
						<RowIcon icon={InformationCircleIcon} />
						<span className="glyphMenuItemLabel">{t("ai.modelSelector.empty")}</span>
					</DropdownMenuItem>
				) : (
					models.map((model) => {
						const modelLogoProvider = resolveLogoProvider(provider, model.name);
						return (
							<DropdownMenuItem key={model.id} onClick={() => onChange(model.id)}>
								{modelLogoProvider && providerLogoMap[modelLogoProvider] ? (
									<ProviderLogo
										provider={modelLogoProvider}
										className={`glyphMenuItemIcon ${styles.menuLogo}`}
									/>
								) : (
									<RowIcon icon={AiChipIcon} />
								)}
								<span className="glyphMenuItemLabel" title={model.name}>
									{model.name}
								</span>
								{model.id === value ? (
									<HugeiconsIcon
										icon={Tick02Icon}
										size="var(--icon-sm)"
										strokeWidth={2.25}
										className="glyphMenuItemCheck"
									/>
								) : null}
							</DropdownMenuItem>
						);
					})
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
