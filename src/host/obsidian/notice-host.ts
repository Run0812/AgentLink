import { Notice } from 'obsidian';

export interface NoticeHost {
	show(message: string): void;
}

export class ObsidianNoticeHost implements NoticeHost {
	show(message: string): void {
		new Notice(message);
	}
}
