import { h, FunctionComponent } from 'preact';
import type { Attachment } from '../../core/types';
import type { SlashCommandPreview } from '../slash-command-utils';

interface InputStateBarProps {
	attachments: Attachment[];
	commandPreview: SlashCommandPreview | null;
	onRemoveAttachment: (id: string) => void;
	onRemoveCommandPreview: () => void;
	onAttachFile: () => void;
	onAttachSelection: () => void;
	canAttachSelection: boolean;
}

export const InputStateBar: FunctionComponent<InputStateBarProps> = ({
	attachments,
	commandPreview,
	onRemoveAttachment,
	onRemoveCommandPreview,
	onAttachFile,
	onAttachSelection,
	canAttachSelection,
}) => {
	const hasContent = attachments.length > 0 || !!commandPreview;

	if (!hasContent) {
		return (
			<div
				className="agentlink-input-state-bar agentlink-input-state-bar--empty"
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					padding: '0.5rem 0.6rem 0.15rem',
					fontSize: '0.75rem',
					color: 'var(--text-muted)',
				}}
			>
				<span
					style={{
						flex: 1,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					Add context (#), files (@), or commands (/)
				</span>
				{canAttachSelection && (
					<button
						type="button"
						onClick={onAttachSelection}
						style={ghostActionStyle}
					>
						Selection
					</button>
				)}
				<button
					type="button"
					onClick={onAttachFile}
					style={ghostActionStyle}
				>
					File
				</button>
			</div>
		);
	}

	return (
		<div
			className="agentlink-input-state-bar"
			style={{
				display: 'flex',
				alignItems: 'center',
				flexWrap: 'wrap',
				gap: '0.4rem',
				padding: '0.5rem 0.6rem 0.1rem',
			}}
		>
			{commandPreview && (
				<Chip
					accent={true}
					prefix={commandPreview.source === 'builtin' ? 'CMD' : '/'}
					label={commandPreview.label}
					title={commandPreview.description ?? commandPreview.label}
					onRemove={onRemoveCommandPreview}
				/>
			)}
			{attachments.map((attachment) => (
				<Chip
					key={attachment.id}
					accent={false}
					prefix={attachment.type === 'selection' ? 'SEL' : attachment.type === 'folder' ? 'DIR' : 'FILE'}
					label={attachment.name}
					title={attachment.path}
					onRemove={() => onRemoveAttachment(attachment.id)}
				/>
			))}
			<button
				type="button"
				onClick={onAttachFile}
				style={ghostActionStyle}
			>
				+ File
			</button>
			{canAttachSelection && (
				<button
					type="button"
					onClick={onAttachSelection}
					style={ghostActionStyle}
				>
					+ Selection
				</button>
			)}
		</div>
	);
};

interface ChipProps {
	accent: boolean;
	label: string;
	prefix: string;
	title: string;
	onRemove: () => void;
}

const Chip: FunctionComponent<ChipProps> = ({ accent, label, prefix, title, onRemove }) => (
	<div
		title={title}
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: '0.35rem',
			maxWidth: '100%',
			padding: '0.2rem 0.45rem',
			borderRadius: '6px',
			border: accent
				? '1px solid var(--interactive-accent)'
				: '1px solid var(--background-modifier-border)',
			background: accent
				? 'var(--background-modifier-hover)'
				: 'var(--background-secondary)',
			color: accent ? 'var(--interactive-accent)' : 'var(--text-normal)',
			fontSize: '0.72rem',
			lineHeight: '1.2',
			minWidth: 0,
		}}
	>
		<span
			style={{
				flexShrink: 0,
				fontSize: '0.62rem',
				fontWeight: '600',
				letterSpacing: '0.04em',
				opacity: 0.8,
			}}
		>
			{prefix}
		</span>
		<span
			style={{
				minWidth: 0,
				maxWidth: '180px',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap',
			}}
		>
			{label}
		</span>
		<button
			type="button"
			onClick={onRemove}
			style={{
				background: 'transparent',
				border: 'none',
				padding: '0',
				margin: '0',
				color: 'inherit',
				cursor: 'pointer',
				fontSize: '0.8rem',
				lineHeight: '1',
				opacity: 0.8,
				flexShrink: 0,
			}}
		>
			×
		</button>
	</div>
);

const ghostActionStyle = {
	background: 'transparent',
	border: '1px solid var(--background-modifier-border)',
	borderRadius: '6px',
	color: 'var(--text-muted)',
	cursor: 'pointer',
	fontSize: '0.72rem',
	lineHeight: '1.2',
	padding: '0.18rem 0.45rem',
	flexShrink: 0,
};
