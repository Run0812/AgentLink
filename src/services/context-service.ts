import { TFile, TFolder, Vault } from 'obsidian';
import type { Attachment } from '../core/types';

/**
 * ContextService - 管理对话上下文附件
 * 
 * 负责：
 * - 创建和管理文件附件
 * - 创建选中文本附件
 * - 缓存文件内容避免重复读取
 * - 验证附件大小和类型
 */
export class ContextService {
	private attachments: Map<string, Attachment> = new Map();
	private fileCache: Map<string, { content: string; mtime: number }> = new Map();
	private vault: Vault;

	// 配置限制
	private readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB
	private readonly MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB
	private readonly MAX_ATTACHMENTS = 10;

	constructor(vault: Vault) {
		this.vault = vault;
	}

	/**
	 * 从文件路径创建附件
	 */
	async createFileAttachment(filePath: string): Promise<Attachment | null> {
		try {
			// 检查附件数量限制
			if (this.attachments.size >= this.MAX_ATTACHMENTS) {
				console.warn('[ContextService] Max attachments reached:', this.MAX_ATTACHMENTS);
				return null;
			}

			// 获取文件
			const file = this.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				console.warn('[ContextService] File not found:', filePath);
				return null;
			}

			// 检查文件大小
			if (file.stat.size > this.MAX_FILE_SIZE) {
				console.warn('[ContextService] File too large:', filePath, file.stat.size);
				return null;
			}

			// 检查总大小限制
			const currentTotal = this.getTotalSize();
			if (currentTotal + file.stat.size > this.MAX_TOTAL_SIZE) {
				console.warn('[ContextService] Total size limit exceeded');
				return null;
			}

			// 读取文件内容（使用缓存）
			const content = await this.readFileWithCache(file);
			if (content === null) {
				return null;
			}

			// 创建附件
			const attachment: Attachment = {
				id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				type: 'file',
				name: file.name,
				path: file.path,
				content,
				size: file.stat.size,
				mimeType: this.getMimeType(file.extension),
			};

			this.attachments.set(attachment.id, attachment);
			console.log('[ContextService] File attached:', file.name);

			return attachment;
		} catch (error) {
			console.error('[ContextService] Error creating file attachment:', error);
			return null;
		}
	}

	/**
	 * 从文件夹创建附件（包含文件夹信息，不包含内容）
	 */
	async createFolderAttachment(folderPath: string): Promise<Attachment | null> {
		try {
			const folder = this.vault.getAbstractFileByPath(folderPath);
			if (!folder || !(folder instanceof TFolder)) {
				console.warn('[ContextService] Folder not found:', folderPath);
				return null;
			}

			// 获取文件夹中的文件列表
			const files = folder.children
				.filter((child): child is TFile => child instanceof TFile)
				.map(f => f.name)
				.join('\n');

			const attachment: Attachment = {
				id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				type: 'folder',
				name: folder.name,
				path: folder.path,
				content: `Folder: ${folder.path}\n\nFiles:\n${files}`,
				size: 0,
			};

			this.attachments.set(attachment.id, attachment);
			console.log('[ContextService] Folder attached:', folder.name);

			return attachment;
		} catch (error) {
			console.error('[ContextService] Error creating folder attachment:', error);
			return null;
		}
	}

	/**
	 * 创建选中文本附件
	 */
	createSelectionAttachment(text: string, sourceFile?: string): Attachment | null {
		if (!text || text.trim().length === 0) {
			return null;
		}

		// 检查大小
		const size = new TextEncoder().encode(text).length;
		if (size > this.MAX_FILE_SIZE) {
			console.warn('[ContextService] Selection too large');
			return null;
		}

		const attachment: Attachment = {
			id: `selection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			type: 'selection',
			name: sourceFile ? `Selection from ${sourceFile}` : 'Selected text',
			path: sourceFile || '',
			content: text,
			size,
		};

		this.attachments.set(attachment.id, attachment);
		console.log('[ContextService] Selection attached, size:', size);

		return attachment;
	}

	/**
	 * 获取所有附件
	 */
	listAttachments(): Attachment[] {
		return Array.from(this.attachments.values());
	}

	/**
	 * 移除附件
	 */
	removeAttachment(id: string): boolean {
		const existed = this.attachments.delete(id);
		if (existed) {
			console.log('[ContextService] Attachment removed:', id);
		}
		return existed;
	}

	/**
	 * 清空所有附件
	 */
	clearAttachments(): void {
		this.attachments.clear();
		console.log('[ContextService] All attachments cleared');
	}

	/**
	 * 获取附件总数
	 */
	getAttachmentCount(): number {
		return this.attachments.size;
	}

	/**
	 * 获取总大小
	 */
	getTotalSize(): number {
		return Array.from(this.attachments.values()).reduce((sum, att) => sum + (att.size || 0), 0);
	}

	/**
	 * 检查是否有附件
	 */
	hasAttachments(): boolean {
		return this.attachments.size > 0;
	}

	/**
	 * 搜索 vault 中的文件（用于 @ 引用）
	 */
	searchFiles(query: string, limit: number = 10): TFile[] {
		const files = this.vault.getFiles();
		const lowerQuery = query.toLowerCase();
		
		return files
			.filter(file => 
				file.path.toLowerCase().includes(lowerQuery) ||
				file.name.toLowerCase().includes(lowerQuery)
			)
			.sort((a, b) => {
				// 优先匹配文件名
				const aNameMatch = a.name.toLowerCase().includes(lowerQuery);
				const bNameMatch = b.name.toLowerCase().includes(lowerQuery);
				if (aNameMatch && !bNameMatch) return -1;
				if (!aNameMatch && bNameMatch) return 1;
				return a.path.localeCompare(b.path);
			})
			.slice(0, limit);
	}

	/**
	 * 搜索 vault 中的文件夹
	 */
	searchFolders(query: string, limit: number = 5): TFolder[] {
		const allFiles = this.vault.getAllLoadedFiles();
		const folders = allFiles.filter((f): f is TFolder => f instanceof TFolder);
		const lowerQuery = query.toLowerCase();
		
		return folders
			.filter(folder => 
				folder.path.toLowerCase().includes(lowerQuery) ||
				folder.name.toLowerCase().includes(lowerQuery)
			)
			.slice(0, limit);
	}

	/**
	 * 读取文件（带缓存）
	 */
	private async readFileWithCache(file: TFile): Promise<string | null> {
		try {
			// 检查缓存
			const cached = this.fileCache.get(file.path);
			if (cached && cached.mtime === file.stat.mtime) {
				return cached.content;
			}

			// 读取文件
			const content = await this.vault.read(file);
			
			// 更新缓存
			this.fileCache.set(file.path, {
				content,
				mtime: file.stat.mtime,
			});

			return content;
		} catch (error) {
			console.error('[ContextService] Error reading file:', file.path, error);
			return null;
		}
	}

	/**
	 * 获取 MIME 类型
	 */
	private getMimeType(extension: string): string {
		const mimeTypes: Record<string, string> = {
			'md': 'text/markdown',
			'txt': 'text/plain',
			'js': 'application/javascript',
			'ts': 'application/typescript',
			'json': 'application/json',
			'css': 'text/css',
			'html': 'text/html',
			'py': 'text/x-python',
			'java': 'text/x-java',
			'cpp': 'text/x-c++',
			'c': 'text/x-c',
			'h': 'text/x-c',
			'rs': 'text/x-rust',
			'go': 'text/x-go',
			'rb': 'text/x-ruby',
			'php': 'text/x-php',
			'sh': 'text/x-shellscript',
			'yaml': 'text/yaml',
			'yml': 'text/yaml',
			'xml': 'text/xml',
			'svg': 'image/svg+xml',
		};
		return mimeTypes[extension.toLowerCase()] || 'text/plain';
	}
}
