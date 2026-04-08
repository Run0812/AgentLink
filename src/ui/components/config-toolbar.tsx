import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ConfigOption } from '../../core/types';

interface ConfigToolbarProps {
	options: ConfigOption[];
	onSelect: (configId: string, value: string) => Promise<void>;
}

const iconByCategory: Record<string, string> = {
	mode: '🛡️',
	model: '⚡',
	thought_level: '💭',
};

// Default labels to show when no config is available from adapter
const defaultLabels: ConfigOption[] = [
	{
		id: 'mode',
		name: 'Mode',
		description: 'Agent permission mode',
		category: 'mode',
		type: 'select',
		currentValue: 'ask',
		options: [
			{ value: 'ask', name: 'Ask', description: 'Request permission before changes' },
			{ value: 'code', name: 'Code', description: 'Full tool access for coding' },
			{ value: 'auto', name: 'Auto', description: 'Auto-confirm safe operations' },
		],
	},
	{
		id: 'model',
		name: 'Model',
		description: 'AI model selection',
		category: 'model',
		type: 'select',
		currentValue: 'default',
		options: [
			{ value: 'default', name: 'Default', description: 'Use default model' },
			{ value: 'fast', name: 'Fast', description: 'Quick responses' },
			{ value: 'quality', name: 'Quality', description: 'Better quality' },
		],
	},
];

export function ConfigToolbar({ options, onSelect }: ConfigToolbarProps) {
	const [openId, setOpenId] = useState<string | null>(null);

	// Use provided options or default labels if empty
	const displayOptions = useMemo(() => {
		const opts = options.filter((o) => o.type === 'select');
		return opts.length > 0 ? opts : defaultLabels;
	}, [options]);

	const hasRealConfig = options.length > 0;

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
			{displayOptions.map((option) => {
				const current = option.options.find((v) => v.value === option.currentValue);
				const icon = iconByCategory[option.category ?? ''] ?? '⚙️';
				const isOpen = openId === option.id;

				return (
					<div key={option.id} style={{ position: 'relative' }}>
						<button
							type="button"
							onClick={() => hasRealConfig && setOpenId(isOpen ? null : option.id)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.2rem',
								padding: '0.2rem 0.4rem',
								background: 'transparent',
								border: '1px solid var(--background-modifier-border)',
								borderRadius: '4px',
								cursor: hasRealConfig ? 'pointer' : 'default',
								fontSize: '0.7rem',
								color: 'var(--text-muted)',
								opacity: hasRealConfig ? 1 : 0.7,
							}}
							disabled={!hasRealConfig}
						>
							<span>{icon}</span>
							<span>{current?.name ?? option.name}</span>
							{hasRealConfig && <span style={{ fontSize: '0.6rem' }}>▾</span>}
						</button>

						{isOpen && hasRealConfig && (
							<div
								style={{
									position: 'absolute',
									bottom: '100%',
									left: '0',
									zIndex: '1000',
									minWidth: '150px',
									padding: '0.3rem',
									background: 'var(--background-primary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: '4px',
									boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
									marginBottom: '0.3rem',
								}}
							>
								{option.options.map((item) => (
									<button
										key={item.value}
										type="button"
										onClick={async () => {
											setOpenId(null);
											await onSelect(option.id, item.value);
										}}
										style={{
											display: 'block',
											width: '100%',
											padding: '0.3rem 0.45rem',
											marginBottom: '0.15rem',
											border: 'none',
											borderRadius: '3px',
											textAlign: 'left',
											cursor: 'pointer',
											fontSize: '0.75rem',
											background:
												item.value === option.currentValue ? 'var(--background-modifier-hover)' : 'transparent',
											color: 'var(--text-normal)',
										}}
									>
										<div>{item.name}</div>
										{item.description && (
											<div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.description}</div>
										)}
									</button>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		);
}
