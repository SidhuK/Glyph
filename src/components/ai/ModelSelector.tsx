import {
	AiChipIcon,
	Alert02Icon,
	InformationCircleIcon,
	Loading03Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { AiModel, AiProviderKind } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { ChevronDown } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import styles from "./ModelSelector.module.css";
import { ProviderLogo, providerLogoMap, resolveLogoProvider } from "./modelSelectorConstants";

interface ModelSelectorProps {
	profileId: string | null;
	value: string;
	onChange: (modelId: string) => void;
	provider: AiProviderKind | null;
}

export function ModelSelector({ profileId, value, onChange, provider }: ModelSelectorProps) {
	const { t } = useTranslation("shell");
	const [menuOpen, setMenuOpen] = useState(false);
	// Listing models can hit the provider's API, so only fetch while the menu is open.
	const modelsQuery = useQuery({
		queryKey: ["ai", "models", profileId, provider],
		queryFn: (): Promise<AiModel[]> => {
			if (!profileId) return Promise.resolve([]);
			return invoke("ai_models_list", { profile_id: profileId, provider });
		},
		enabled: profileId !== null && menuOpen,
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
		<DropdownMenu onOpenChange={setMenuOpen}>
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
				{modelsQuery.isPending || (modelsQuery.isFetching && !models?.length) ? (
					<DropdownMenuItem disabled>
						<DropdownMenuItemIcon icon={Loading03Icon} />
						<span className="glyphMenuItemLabel">{t("ai.modelSelector.loading")}</span>
					</DropdownMenuItem>
				) : models?.length ? (
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
									<DropdownMenuItemIcon icon={AiChipIcon} />
								)}
								<span className="glyphMenuItemLabel" title={model.name}>
									{model.name}
								</span>
								{model.id === value ? <DropdownMenuItemCheck /> : null}
							</DropdownMenuItem>
						);
					})
				) : modelsQuery.isError ? (
					<>
						<DropdownMenuItem disabled title={extractErrorMessage(modelsQuery.error)}>
							<DropdownMenuItemIcon icon={Alert02Icon} />
							<span className="glyphMenuItemLabel">{t("ai.modelSelector.loadFailed")}</span>
						</DropdownMenuItem>
						<DropdownMenuItem closeOnClick={false} onClick={() => void modelsQuery.refetch()}>
							<DropdownMenuItemIcon icon={RefreshIcon} />
							<span className="glyphMenuItemLabel">{t("ai.modelSelector.retry")}</span>
						</DropdownMenuItem>
					</>
				) : (
					<DropdownMenuItem disabled>
						<DropdownMenuItemIcon icon={InformationCircleIcon} />
						<span className="glyphMenuItemLabel">{t("ai.modelSelector.empty")}</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
