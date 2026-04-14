import type { App, TAbstractFile, TFile } from 'obsidian';

export interface VaultHost {
	getAbstractFileByPath(path: string): TAbstractFile | null;
	read(file: TFile): Promise<string>;
	create(path: string, content: string): Promise<TFile>;
	modify(file: TFile, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	getFiles(): TFile[];
	getAllLoadedFiles(): TAbstractFile[];
}

export class ObsidianVaultHost implements VaultHost {
	constructor(private readonly app: App) {}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.app.vault.getAbstractFileByPath(path);
	}

	read(file: TFile): Promise<string> {
		return this.app.vault.read(file);
	}

	create(path: string, content: string): Promise<TFile> {
		return this.app.vault.create(path, content);
	}

	modify(file: TFile, content: string): Promise<void> {
		return this.app.vault.modify(file, content);
	}

	createFolder(path: string): Promise<void> {
		return this.app.vault.createFolder(path).then(() => undefined);
	}

	getFiles(): TFile[] {
		return this.app.vault.getFiles();
	}

	getAllLoadedFiles(): TAbstractFile[] {
		return this.app.vault.getAllLoadedFiles();
	}
}
