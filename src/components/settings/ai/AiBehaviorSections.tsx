interface AiBehaviorSectionsProps {
	temperature: number;
	onTemperatureChange: (value: number) => void;
	topP: number;
	onTopPChange: (value: number) => void;
	maxTokens: number;
	onMaxTokensChange: (value: number) => void;
	streamResponses: boolean;
	onToggleStreamResponses: () => void;
	autoContext: boolean;
	onToggleAutoContext: () => void;
	citeSources: boolean;
	onToggleCiteSources: () => void;
	allowWeb: boolean;
	onToggleAllowWeb: () => void;
	redactSecrets: boolean;
	onToggleRedactSecrets: () => void;
	storeChats: boolean;
	onToggleStoreChats: () => void;
	tone: string;
	onToneChange: (value: string) => void;
	autoTitle: boolean;
	onToggleAutoTitle: () => void;
	toolPolicy: string;
	onToolPolicyChange: (value: string) => void;
}

export function AiBehaviorSections({
	temperature,
	onTemperatureChange,
	topP,
	onTopPChange,
	maxTokens,
	onMaxTokensChange,
	streamResponses,
	onToggleStreamResponses,
	autoContext,
	onToggleAutoContext,
	citeSources,
	onToggleCiteSources,
	allowWeb,
	onToggleAllowWeb,
	redactSecrets,
	onToggleRedactSecrets,
	storeChats,
	onToggleStoreChats,
	tone,
	onToneChange,
	autoTitle,
	onToggleAutoTitle,
	toolPolicy,
	onToolPolicyChange,
}: AiBehaviorSectionsProps) {
	return (
		<>
			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">Defaults</div>
						<div className="settingsCardHint">Generation settings.</div>
					</div>
					<div className="settingsBadgeWarn">Under construction</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Temperature</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Creativity level.</div>
					</div>
					<div className="settingsRange">
						<input
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={temperature}
							onChange={(e) => onTemperatureChange(Number(e.target.value))}
						/>
						<span className="settingsRangeValue">{temperature.toFixed(2)}</span>
					</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Top P</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Sampling nucleus.</div>
					</div>
					<div className="settingsRange">
						<input
							type="range"
							min={0.2}
							max={1}
							step={0.05}
							value={topP}
							onChange={(e) => onTopPChange(Number(e.target.value))}
						/>
						<span className="settingsRangeValue">{topP.toFixed(2)}</span>
					</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Max tokens</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Upper response length.</div>
					</div>
					<select
						value={maxTokens}
						onChange={(e) => onMaxTokensChange(Number(e.target.value))}
					>
						<option value={512}>512</option>
						<option value={1024}>1024</option>
						<option value={2048}>2048</option>
						<option value={4096}>4096</option>
					</select>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Streaming</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Show responses live.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={streamResponses}
							onChange={onToggleStreamResponses}
						/>
						<span />
					</label>
				</div>
			</section>

			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">Context</div>
						<div className="settingsCardHint">What the model sees.</div>
					</div>
					<div className="settingsBadgeWarn">Under construction</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Auto context</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Include related notes.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={autoContext}
							onChange={onToggleAutoContext}
						/>
						<span />
					</label>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Citations</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Show source badges.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={citeSources}
							onChange={onToggleCiteSources}
						/>
						<span />
					</label>
				</div>
			</section>

			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">Privacy</div>
						<div className="settingsCardHint">Control data sharing.</div>
					</div>
					<div className="settingsBadgeWarn">Under construction</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Allow web tools</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Enable tool access.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={allowWeb}
							onChange={onToggleAllowWeb}
						/>
						<span />
					</label>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Redact secrets</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Mask API keys.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={redactSecrets}
							onChange={onToggleRedactSecrets}
						/>
						<span />
					</label>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Store chats</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Keep AI history.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={storeChats}
							onChange={onToggleStoreChats}
						/>
						<span />
					</label>
				</div>
			</section>

			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">UX</div>
						<div className="settingsCardHint">Response style.</div>
					</div>
					<div className="settingsBadgeWarn">Under construction</div>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Tone</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Communication style.</div>
					</div>
					<select value={tone} onChange={(e) => onToneChange(e.target.value)}>
						<option value="balanced">Balanced</option>
						<option value="precise">Precise</option>
						<option value="friendly">Friendly</option>
					</select>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Auto titles</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">Title AI outputs.</div>
					</div>
					<label className="settingsToggle">
						<input
							type="checkbox"
							checked={autoTitle}
							onChange={onToggleAutoTitle}
						/>
						<span />
					</label>
				</div>
				<div className="settingsField">
					<div>
						<div className="settingsLabelRow">
							<div className="settingsLabel">Tool policy</div>
							<span className="settingsBadgeWarn">Under construction</span>
						</div>
						<div className="settingsHelp">When tools can run.</div>
					</div>
					<select
						value={toolPolicy}
						onChange={(e) => onToolPolicyChange(e.target.value)}
					>
						<option value="ask">Ask first</option>
						<option value="auto">Auto</option>
						<option value="never">Never</option>
					</select>
				</div>
			</section>
		</>
	);
}
