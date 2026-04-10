import { h, FunctionComponent } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { TFile, TFolder } from 'obsidian';

export type AutocompleteTrigger = 'slash' | 'mention' | 'topic' | null;

interface SuggestionItem {
	id: string;
	label: string;
	description?: string;
	icon?: string;
	data?: unknown;
}

interface InputAutocompleteProps {
	trigger: AutocompleteTrigger;
	query: string;
	position: { x: number; y: number };
	suggestions: SuggestionItem[];
	onSelect: (item: SuggestionItem) => void | Promise<void>;
	onClose: () => void;
}

/**
 * InputAutocomplete - 自动完成菜单组件（紧凑版）
 * 
 * 参考 GitHub Copilot 风格：
 * - 紧凑布局，小字体
 * - 向上弹出（底部对齐）
 * - 最小化间距
 */
export const InputAutocomplete: FunctionComponent<InputAutocompleteProps> = ({
	trigger,
	query,
	position,
	suggestions,
	onSelect,
	onClose,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// 重置选中索引当建议列表变化时
	useEffect(() => {
		setSelectedIndex(0);
	}, [suggestions.length]);

	// 键盘导航
	const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				setSelectedIndex(prev => 
					prev < suggestions.length - 1 ? prev + 1 : prev
				);
				break;
			case 'ArrowUp':
				e.preventDefault();
				setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (suggestions[selectedIndex]) {
					await onSelect(suggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				onClose();
				break;
			case 'Tab':
				e.preventDefault();
				if (suggestions[selectedIndex]) {
					await onSelect(suggestions[selectedIndex]);
				}
				break;
		}
	}, [suggestions, selectedIndex, onSelect, onClose]);

	// 添加全局键盘监听
	useEffect(() => {
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	// 点击外部关闭
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [onClose]);

	// 如果没有建议，不显示任何内容（简洁）
	if (suggestions.length === 0) {
		return null;
	}

	const getTriggerLabel = () => {
		switch (trigger) {
			case 'slash': return 'Commands';
			case 'mention': return 'Files';
			case 'topic': return 'Topics';
			default: return '';
		}
	};

	return (
		<div 
			ref={containerRef}
			className="agentlink-autocomplete"
			style={{
				position: 'absolute',
				left: position.x,
				bottom: '100%', // 向上弹出：底部对齐父元素
				marginBottom: '4px',
				zIndex: 1000,
				minWidth: '240px',
				maxWidth: '360px',
				background: 'var(--background-primary)',
				border: '1px solid var(--background-modifier-border)',
				borderRadius: '6px',
				boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)', // 向上阴影
				fontSize: '12px',
			}}
		>
			{/* 紧凑标题 */}
			<div 
				className="agentlink-autocomplete-header"
				style={{
					padding: '4px 10px',
					borderBottom: '1px solid var(--background-modifier-border)',
					color: 'var(--text-muted)',
					fontSize: '10px',
					textTransform: 'uppercase',
					letterSpacing: '0.5px',
				}}
			>
				{getTriggerLabel()}
			</div>
			
			<div 
				className="agentlink-autocomplete-list"
				style={{
					maxHeight: '200px',
					overflowY: 'auto',
				}}
			>
				{suggestions.map((item, index) => (
					<div
						key={item.id}
						className={`agentlink-autocomplete-item ${index === selectedIndex ? 'is-selected' : ''}`}
						onClick={async () => await onSelect(item)}
						onMouseEnter={() => setSelectedIndex(index)}
						style={{
							padding: '5px 10px',
							cursor: 'pointer',
							borderBottom: '1px solid var(--background-modifier-border-hover)',
							background: index === selectedIndex ? 'var(--background-modifier-hover)' : 'transparent',
							display: 'flex',
							alignItems: 'center',
							gap: '6px',
						}}
					>
						{/* 图标 */}
						{item.icon && (
							<span 
								className="agentlink-autocomplete-icon"
								style={{
									width: '14px',
									textAlign: 'center',
									color: 'var(--text-muted)',
									fontSize: '10px',
									flexShrink: 0,
								}}
							>
								{item.icon}
							</span>
						)}
						<div 
							className="agentlink-autocomplete-content"
							style={{
								flex: 1,
								minWidth: 0,
								overflow: 'hidden',
							}}
						>
							<div 
								className="agentlink-autocomplete-label"
								style={{
									fontWeight: 500,
									color: 'var(--text-normal)',
									fontSize: '12px',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{item.label}
							</div>
							{item.description && (
								<div 
									className="agentlink-autocomplete-description"
									style={{
										fontSize: '10px',
										color: 'var(--text-muted)',
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										marginTop: '1px',
									}}
								>
									{item.description}
								</div>
							)}
						</div>
					</div>
				))}
			</div>
			
			{/* 紧凑底部提示 */}
			<div 
				className="agentlink-autocomplete-footer"
				style={{
					padding: '4px 10px',
					borderTop: '1px solid var(--background-modifier-border)',
					fontSize: '10px',
					color: 'var(--text-muted)',
					display: 'flex',
					gap: '10px',
				}}
			>
				<span>↑↓ navigate</span>
				<span>↵ select</span>
				<span>esc close</span>
			</div>
		</div>
	);
};

/**
 * 创建斜杠命令建议项（紧凑版）
 */
export function createSlashCommandSuggestions(): SuggestionItem[] {
	return [
		{
			id: 'web',
			label: '/web',
			description: 'Search web for information',
			icon: '/',
		},
		{
			id: 'test',
			label: '/test',
			description: 'Run project tests',
			icon: '/',
		},
		{
			id: 'clear',
			label: '/clear',
			description: 'Clear conversation',
			icon: '/',
		},
		{
			id: 'help',
			label: '/help',
			description: 'Show help',
			icon: '/',
		},
	];
}

/**
 * 创建文件建议项（紧凑版）
 * @param files - 文件列表
 * @param currentFile - 当前活动文件（可选，用于添加 "Current note" 选项）
 */
export function createFileSuggestions(files: TFile[], currentFile?: TFile | null): SuggestionItem[] {
	const suggestions: SuggestionItem[] = [];
	
	// Add "Current note" option if there's an active file
	if (currentFile) {
		suggestions.push({
			id: 'current_note',
			label: 'Current note',
			description: currentFile.path,
			icon: '📄',
			data: { type: 'current_note', file: currentFile },
		});
	}
	
	// Add regular files
	suggestions.push(...files.map(file => ({
		id: `file_${file.path}`,
		label: file.name,
		description: file.path,
		icon: '📄',
		data: { type: 'file', file },
	})));
	
	return suggestions;
}

/**
 * 创建文件夹建议项（紧凑版）
 */
export function createFolderSuggestions(folders: TFolder[]): SuggestionItem[] {
	return folders.map(folder => ({
		id: `folder_${folder.path}`,
		label: folder.name,
		description: folder.path,
		icon: 'D',
		data: folder,
	}));
}

/**
 * 创建话题建议项（紧凑版）
 * 
 * @param topics - 话题列表
 * @param query - 搜索查询
 */
export function createTopicSuggestions(topics: string[], query: string): SuggestionItem[] {
	const filteredTopics = topics
		.filter(topic => topic.toLowerCase().includes(query.toLowerCase()))
		.slice(0, 8);
	
	return filteredTopics.map(topic => ({
		id: `topic_${topic}`,
		label: topic,
		description: 'Topic reference',
		icon: '#',
	}));
}
