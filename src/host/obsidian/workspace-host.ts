import type { App, Editor, TFile } from 'obsidian';

export interface WorkspaceHost {
	getActiveFile(): TFile | null;
	getActiveEditor(): Editor | null;
	getSelectedText(): string;
}

export class ObsidianWorkspaceHost implements WorkspaceHost {
	constructor(private readonly app: App) {}

	getActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	getActiveEditor(): Editor | null {
		return this.app.workspace.activeEditor?.editor ?? null;
	}

	getSelectedText(): string {
		return this.getActiveEditor()?.getSelection() ?? '';
	}
}
