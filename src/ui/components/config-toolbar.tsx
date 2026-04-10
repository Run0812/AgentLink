import { h } from 'preact';
import { useState } from 'preact/hooks';
import { ConfigOption } from '../../core/types';

interface ConfigToolbarProps {
	options: ConfigOption[];
	onSelect: (configId: string, value: string | boolean) => Promise<void>;
}

const iconByCategory: Record<string, string> = {
	mode: 'M',
	model: 'AI',
	thought_level: 'T',
};

export function ConfigToolbar({ options, onSelect }: ConfigToolbarProps) {
	const [openId, setOpenId] = useState<string | null>(null);

	if (options.length === 0) {
		return null;
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
			{options.map((option) => {
				const icon = iconByCategory[option.category ?? ''] ?? 'C';
				const isOpen = openId === option.id;
				const isSelectable = option.type === 'select' && option.options.length > 1;
				const buttonLabel = option.type === 'select'
					? option.options.find((item) => item.value === option.currentValue)?.name ?? option.name
					: `${option.name}: ${option.currentValue ? 'On' : 'Off'}`;

				return (
					<div key={option.id} style={{ position: 'relative' }}>
						<button
							type="button"
							onClick={async () => {
								if (option.type === 'boolean') {
									await onSelect(option.id, !option.currentValue);
									return;
								}
								if (!isSelectable) {
									return;
								}
								setOpenId(isOpen ? null : option.id);
							}}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.2rem',
								padding: '0.2rem 0.4rem',
								background: 'transparent',
								border: '1px solid var(--background-modifier-border)',
								borderRadius: '4px',
								cursor: 'pointer',
								fontSize: '0.7rem',
								color: 'var(--text-muted)',
							}}
							aria-label={option.name}
						>
							<span>{icon}</span>
							<span>{buttonLabel}</span>
							{isSelectable && <span style={{ fontSize: '0.6rem' }}>?</span>}
						</button>

						{option.type === 'select' && isSelectable && isOpen && (
							<div
								style={{
									position: 'absolute',
									bottom: '100%',
									left: '0',
									zIndex: '1000',
									minWidth: '180px',
									maxWidth: '260px',
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
