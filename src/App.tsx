import "./App.css";
import { AppShell } from "./components/app/AppShell";
import { useAppBootstrap } from "./hooks/useAppBootstrap";

function App() {
	const state = useAppBootstrap();

	return (
		<AppShell
			vaultPath={state.vaultPath}
			lastVaultPath={state.lastVaultPath}
			vaultSchemaVersion={state.vaultSchemaVersion}
			recentVaults={state.recentVaults}
			isIndexing={state.isIndexing}
			appName={state.info?.name ?? null}
			error={state.error}
			setError={state.setError}
			rootEntries={state.rootEntries}
			setRootEntries={state.setRootEntries}
			childrenByDir={state.childrenByDir}
			setChildrenByDir={state.setChildrenByDir}
			dirSummariesByParent={state.dirSummariesByParent}
			setDirSummariesByParent={state.setDirSummariesByParent}
			expandedDirs={state.expandedDirs}
			setExpandedDirs={state.setExpandedDirs}
			activeFilePath={state.activeFilePath}
			setActiveFilePath={state.setActiveFilePath}
			activeNoteId={state.activeNoteId}
			activeNoteTitle={state.activeNoteTitle}
			onOpenVault={state.onOpenVault}
			onOpenVaultAtPath={state.onOpenVaultAtPath}
			onContinueLastVault={state.onContinueLastVault}
			onCreateVault={state.onCreateVault}
			closeVault={state.closeVault}
			startIndexRebuild={state.startIndexRebuild}
			tags={state.tags}
			tagsError={state.tagsError}
			refreshTags={state.refreshTags}
		/>
	);
}

export default App;
