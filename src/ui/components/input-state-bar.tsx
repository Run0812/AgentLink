import { h, FunctionComponent } from 'preact';
import { useCallback } from 'preact/hooks';
import type { Attachment } from '../../core/types';

interface InputStateBarProps {
	attachments: Attachment[];
	totalSize: number;
	onRemoveAttachment: (id: string) => void;
	onAttachFile: () => void;
	onAttachSelection: () => void;
	onAttachCurrentNote: () => void;
	canAttachSelection: boolean;
}

/**
 * InputStateBar - 输入状态栏组件（简洁版）
 * 
 * 参考 GitHub Copilot 风格：
 * - 简洁的标签显示
 * - 无 emoji，使用图标或纯文字
 * - 紧凑的布局
 */
export const InputStateBar: FunctionComponent<InputStateBarProps> = ({
	attachments,
	totalSize,
	onRemoveAttachment,
	onAttachFile,
	onAttachSelection,
	onAttachCurrentNote,
	canAttachSelection,
}) => {
	const formatSize = useCallback((bytes: number): string => {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}, []);

	const getAttachmentTypeLabel = useCallback((type: string): string => {
		switch (type) {
			case 'file': return 'File';
			case 'folder': return 'Folder';
			case 'selection': return 'Selection';
			default: return 'Context';
		}
	}, []);

	// 简洁的空状态 - 参考 Copilot 的小字提示
	if (attachments.length === 0) {
		return (
			<div 
				className="agentlink-input-state-bar agentlink-input-state-bar--empty"
				style={{
					padding: '4px 12px',
					fontSize: '12px',
					color: 'var(--text-muted)',
					display: 'flex',
					alignItems: 'center',
					gap: '12px',
				}}
			>
				<span style={{ flex: 1 }}>
					Add context (#), files (@), or commands (/)
				</span>
				<div style={{ display: 'flex', gap: '8px' }}>
					<button 
						className="agentlink-input-state-link"
						onClick={onAttachCurrentNote}
						style={{
							background: 'none',
							border: 'none',
							color: 'var(--text-muted)',
							cursor: 'pointer',
							fontSize: '12px',
							padding: '2px 6px',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.color = 'var(--text-normal)';
							e.currentTarget.style.textDecoration = 'underline';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.color = 'var(--text-muted)';
							e.currentTarget.style.textDecoration = 'none';
						}}
					>
						Current note
					</button>
					{canAttachSelection && (
						<button 
							className="agentlink-input-state-link"
							onClick={onAttachSelection}
							style={{
								background: 'none',
								border: 'none',
								color: 'var(--text-muted)',
								cursor: 'pointer',
								fontSize: '12px',
								padding: '2px 6px',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = 'var(--text-normal)';
								e.currentTarget.style.textDecoration = 'underline';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = 'var(--text-muted)';
								e.currentTarget.style.textDecoration = 'none';
							}}
						>
							Selection
						</button>
					)}
					<button 
						className="agentlink-input-state-link"
						onClick={onAttachFile}
						style={{
							background: 'none',
							border: 'none',
							color: 'var(--text-muted)',
							cursor: 'pointer',
							fontSize: '12px',
							padding: '2px 6px',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.color = 'var(--text-normal)';
							e.currentTarget.style.textDecoration = 'underline';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.color = 'var(--text-muted)';
							e.currentTarget.style.textDecoration = 'none';
						}}
					>
						File
					</button>
				</div>
			</div>
		);
	}

	// 有附件时的紧凑显示
	return (
		<div 
			className="agentlink-input-state-bar"
			style={{
				padding: '6px 12px',
				borderBottom: '1px solid var(--background-modifier-border)',
			}}
		>
			<div 
				className="agentlink-input-state-attachments"
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '6px',
					marginBottom: '4px',
				}}
			>
				{attachments.map(att => (
					<div 
						key={att.id} 
						className={`agentlink-attachment-tag agentlink-attachment-tag--${att.type}`}
						title={`${att.path} (${formatSize(att.size || 0)})`}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '4px',
							padding: '2px 8px',
							background: 'var(--background-secondary)',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: '3px',
							fontSize: '12px',
							color: 'var(--text-normal)',
						}}
					>
						<span 
							className="agentlink-attachment-type"
							style={{
								fontSize: '10px',
								color: 'var(--text-muted)',
								textTransform: 'uppercase',
							}}
						>
							{getAttachmentTypeLabel(att.type)}
						</span>
						<span 
							className="agentlink-attachment-name"
							style={{
								maxWidth: '150px',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{att.name}
						</span>
						<button 
							className="agentlink-attachment-remove"
							onClick={() => onRemoveAttachment(att.id)}
							title="Remove"
							style={{
								background: 'none',
								border: 'none',
								color: 'var(--text-muted)',
								cursor: 'pointer',
								fontSize: '14px',
								padding: '0 2px',
								lineHeight: 1,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = 'var(--text-error)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = 'var(--text-muted)';
							}}
						>
							×
						</button>
					</div>
				))}
			</div>
			
			<div 
				className="agentlink-input-state-footer"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					fontSize: '11px',
					color: 'var(--text-muted)',
				}}
			>
				<span>
					{attachments.length} context{attachments.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
				</span>
				<button 
					className="agentlink-input-state-btn"
					onClick={onAttachFile}
					style={{
						background: 'none',
						border: 'none',
						color: 'var(--text-muted)',
						cursor: 'pointer',
						fontSize: '11px',
						padding: '2px 6px',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = 'var(--text-normal)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = 'var(--text-muted)';
					}}
				>
					+ Add file
				</button>
			</div>
		</div>
	);
};
