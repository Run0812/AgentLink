import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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

const TOOLBAR_BUTTON_MIN_WIDTH = '108px';
const TOOLBAR_BUTTON_MAX_WIDTH = '156px';
const TOOLBAR_DROPDOWN_MIN_WIDTH = '220px';
const TOOLBAR_DROPDOWN_MAX_WIDTH = 'min(280px, calc(100vw - 32px))';

export function ConfigToolbar({ options, onSelect }: ConfigToolbarProps) {
	const [openId, setOpenId] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!openId) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (!rootRef.current?.contains(target)) {
				setOpenId(null);
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		return () => document.removeEventListener('mousedown', handlePointerDown);
	}, [openId]);

	if (options.length === 0) {
		return null;
	}

	return (
		<div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
								justifyContent: 'space-between',
								gap: '0.25rem',
								minWidth: TOOLBAR_BUTTON_MIN_WIDTH,
								maxWidth: TOOLBAR_BUTTON_MAX_WIDTH,
								height: '24px',
								padding: '0.2rem 0.45rem',
								boxSizing: 'border-box',
								background: 'transparent',
								border: '1px solid var(--background-modifier-border)',
								borderRadius: '4px',
								cursor: 'pointer',
								fontSize: '0.7rem',
								color: 'var(--text-muted)',
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								flexShrink: 0,
							}}
							aria-label={option.name}
						>
							<span style={{ flexShrink: 0 }}>{icon}</span>
							<span
								style={{
									flex: '1',
									minWidth: 0,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{buttonLabel}
							</span>
							{isSelectable && <span style={{ fontSize: '0.6rem', flexShrink: 0 }}>▾</span>}
						</button>

						{option.type === 'select' && isSelectable && isOpen && (
							<div
								style={{
									position: 'absolute',
									bottom: '100%',
									left: '0',
									zIndex: '1000',
									minWidth: TOOLBAR_DROPDOWN_MIN_WIDTH,
									maxWidth: TOOLBAR_DROPDOWN_MAX_WIDTH,
									padding: '0.3rem',
									boxSizing: 'border-box',
									background: 'var(--background-primary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: '4px',
									boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
									marginBottom: '0.3rem',
									overflowX: 'hidden',
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
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'stretch',
											gap: '0.12rem',
											width: '100%',
											minHeight: '40px',
											padding: '0.38rem 0.45rem',
											marginBottom: '0.15rem',
											boxSizing: 'border-box',
											border: 'none',
											borderRadius: '3px',
											textAlign: 'left',
											cursor: 'pointer',
											fontSize: '0.75rem',
											background:
												item.value === option.currentValue ? 'var(--background-modifier-hover)' : 'transparent',
											color: 'var(--text-normal)',
											overflow: 'hidden',
											lineHeight: '1.35',
										}}
									>
										<div
											style={{
												lineHeight: '1.3',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{item.name}
										</div>
										{item.description && (
											<div
												style={{
													fontSize: '0.68rem',
													color: 'var(--text-muted)',
													lineHeight: '1.3',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{item.description}
											</div>
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
