import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { FolderAddIcon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "@tanstack/react-query";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { SpaceSelectionResult } from "../../contexts/SpaceContext";
import { revealVariants } from "./onboardingMotion";

const CHOICE_ICON_SIZE = 28;

function useSpaceSelection(
	select: () => Promise<SpaceSelectionResult>,
	failedMessage: string,
	beforeSelect?: () => Promise<void>,
) {
	const { t } = useTranslation("shell");
	return useMutation({
		mutationFn: async () => {
			try {
				await beforeSelect?.();
			} catch (cause) {
				throw new Error(
					t("onboarding.errors.saveProgress", { message: extractErrorMessage(cause) }),
				);
			}
			const result = await select();
			if (result === "failed") throw new Error(failedMessage);
			return result;
		},
	});
}

/** Create and open mutations that clear each other's error when one starts. */
export function useSpaceSelections(beforeSelect?: () => Promise<void>) {
	const { t } = useTranslation("shell");
	const { onCreateSpace, onOpenSpace } = useSpace();
	const create = useSpaceSelection(onCreateSpace, t("onboarding.space.createFailed"), beforeSelect);
	const open = useSpaceSelection(onOpenSpace, t("onboarding.space.openFailed"), beforeSelect);
	return {
		create,
		open,
		busy: create.isPending || open.isPending,
		error: create.error ?? open.error,
		startCreate: () => {
			open.reset();
			create.mutate();
		},
		startOpen: () => {
			create.reset();
			open.mutate();
		},
	};
}

interface OnboardingSpaceChoicesProps {
	/** Runs before the picker opens; a rejection stops the selection and is shown here. */
	beforeSelect?: () => Promise<void>;
}

export function OnboardingSpaceChoices({ beforeSelect }: OnboardingSpaceChoicesProps) {
	const { t } = useTranslation("shell");
	const selections = useSpaceSelections(beforeSelect);
	const choices = [
		{
			id: "create",
			icon: FolderAddIcon,
			mutation: selections.create,
			start: selections.startCreate,
		},
		{ id: "open", icon: FolderOpenIcon, mutation: selections.open, start: selections.startOpen },
	] as const;

	return (
		<>
			<div className="obTiles">
				{choices.map(({ id, icon, mutation, start }) => (
					<m.button
						key={id}
						type="button"
						className="obTile"
						variants={revealVariants}
						disabled={selections.busy}
						aria-busy={mutation.isPending}
						onClick={start}
					>
						<span className="obTileIcon" aria-hidden="true">
							<HugeiconsIcon icon={icon} size={CHOICE_ICON_SIZE} />
						</span>
						<span className="obTileTitle">
							{mutation.isPending
								? t("onboarding.space.working")
								: t(`onboarding.space.${id}.title`)}
						</span>
						<span className="obTileCaption">{t(`onboarding.space.${id}.body`)}</span>
					</m.button>
				))}
			</div>
			{selections.error ? (
				<p role="alert" className="onboardingError">
					{selections.error.message}
				</p>
			) : null}
		</>
	);
}
