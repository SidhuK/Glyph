import { useQuery } from "@tanstack/react-query";
import { showNativePopupMenu, type NativeContextMenuItem } from "../../lib/nativeContextMenu";
import { toast } from "../../lib/toast";
import type { AiModel, AiProviderKind } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { ChevronDown } from "../Icons";
import styles from "./ModelSelector.module.css";
import { ProviderLogo, providerLogoMap, resolveLogoProvider } from "./modelSelectorConstants";

interface ModelSelectorProps {
	profileId: string | null;
	value: string;
	onChange: (modelId: string) => void;
	provider: AiProviderKind | null;
}

export function ModelSelector({ profileId, value, onChange, provider }: ModelSelectorProps) {
	const modelsQuery = useQuery({
		queryKey: ["ai", "models", profileId, provider],
		queryFn: () => {
			if (!profileId) return Promise.resolve<AiModel[]>([]);
			return invoke("ai_models_list", { profile_id: profileId, provider });
		},
		enabled: false,
	});
	const selectedModel = modelsQuery.data?.find((model) => model.id === value);
	const displayLabel = selectedModel?.name || value || "Model";
	const logoProvider = resolveLogoProvider(provider, selectedModel?.name);
	const providerTitle = logoProvider
		? (providerLogoMap[logoProvider]?.label ?? logoProvider)
		: "Model provider";

	async function openModelMenu(anchor: Element): Promise<void> {
		try {
			const result = await modelsQuery.refetch();
			if (!anchor.isConnected) return;
			if (result.error) {
				toast.error("Could not load models", {
					description: result.error instanceof Error ? result.error.message : String(result.error),
				});
				return;
			}
			const items: NativeContextMenuItem[] = !result.data?.length
				? [
						{
							label: "No models available",
							enabled: false,
							action: () => {},
						},
					]
				: result.data.map((model) => ({
						label: model.name,
						checked: model.id === value,
						action: () => onChange(model.id),
					}));
			await showNativePopupMenu(
				{ currentTarget: anchor, preventDefault: () => {}, stopPropagation: () => {} },
				items,
			);
		} catch (error) {
			toast.error("Could not open model menu", {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return (
		<button
			type="button"
			className={styles.trigger}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void openModelMenu(event.currentTarget);
			}}
			title={value || "Select model"}
			aria-label="Select model"
			aria-haspopup="menu"
			disabled={!profileId || modelsQuery.isFetching}
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
		</button>
	);
}
