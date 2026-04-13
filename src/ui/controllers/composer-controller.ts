export interface InlineTokenConfig {
	kind: 'attachment' | 'command';
	id: string;
	label: string;
	rawText: string;
	removableId?: string;
}

export interface ComposerControllerDeps {
	getInputEl: () => HTMLDivElement | null;
	onAttachmentRemove: (attachmentId: string) => void;
}

export class ComposerController {
	private deps: ComposerControllerDeps;
	private selectionRange: Range | null = null;

	constructor(deps: ComposerControllerDeps) {
		this.deps = deps;
	}

	refreshPlaceholderState(): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		const hasContent = inputEl.childNodes.length > 0 && this.getText().length > 0;
		if (hasContent) {
			inputEl.style.removeProperty('position');
			inputEl.style.removeProperty('color');
			return;
		}

		inputEl.style.position = 'relative';
	}

	getText(): string {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return '';
		}

		return this.serializeNode(inputEl);
	}

	setText(text: string): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		inputEl.empty();
		if (text) {
			inputEl.appendChild(document.createTextNode(text));
		}
		this.refreshPlaceholderState();
	}

	clear(): void {
		this.setText('');
	}

	focus(): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		inputEl.focus();
		const range = document.createRange();
		range.selectNodeContents(inputEl);
		range.collapse(false);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		this.captureSelection();
	}

	captureSelection(): void {
		if (!this.isSelectionInsideComposer()) {
			return;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return;
		}

		this.selectionRange = selection.getRangeAt(0).cloneRange();
	}

	restoreSelection(): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl || !this.selectionRange) {
			return;
		}

		const selection = window.getSelection();
		if (!selection) {
			return;
		}

		selection.removeAllRanges();
		selection.addRange(this.selectionRange.cloneRange());
	}

	getTextBeforeCaret(): string {
		const inputEl = this.deps.getInputEl();
		if (!inputEl || !this.isSelectionInsideComposer()) {
			return this.getText();
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return '';
		}

		const range = selection.getRangeAt(0).cloneRange();
		const prefixRange = document.createRange();
		prefixRange.selectNodeContents(inputEl);
		prefixRange.setEnd(range.endContainer, range.endOffset);
		return this.serializeFragment(prefixRange.cloneContents());
	}

	replaceTriggerTextInCurrentNode(triggerChar: string): { trailingText: string } | null {
		const context = this.getCurrentTextNodeContext(this.selectionRange);
		if (!context) {
			return null;
		}

		const triggerIndex = context.textBefore.lastIndexOf(triggerChar);
		if (triggerIndex < 0) {
			return null;
		}

		const lastWhitespace = Math.max(
			context.textBefore.lastIndexOf(' '),
			context.textBefore.lastIndexOf('\n'),
		);
		if (triggerIndex < lastWhitespace) {
			return null;
		}

		context.textNode.textContent = context.textBefore.slice(0, triggerIndex) + context.textAfter;
		const range = document.createRange();
		range.setStart(context.textNode, triggerIndex);
		range.collapse(true);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		this.selectionRange = range.cloneRange();

		return { trailingText: context.textAfter };
	}

	insertTextAtCursor(text: string): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		inputEl.focus();
		this.restoreSelection();
		document.execCommand('insertText', false, text);
		this.captureSelection();
		this.refreshPlaceholderState();
	}

	insertInlineToken(config: InlineTokenConfig): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		inputEl.focus();
		this.restoreSelection();
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !this.isSelectionInsideComposer()) {
			this.focus();
		}

		const activeSelection = window.getSelection();
		if (!activeSelection || activeSelection.rangeCount === 0) {
			return;
		}

		const range = activeSelection.getRangeAt(0);
		range.deleteContents();

		const token = this.createInlineTokenElement(config);
		const trailingSpace = document.createTextNode(' ');
		range.insertNode(trailingSpace);
		range.insertNode(token);

		const caretRange = document.createRange();
		caretRange.setStartAfter(trailingSpace);
		caretRange.collapse(true);
		activeSelection.removeAllRanges();
		activeSelection.addRange(caretRange);
		this.captureSelection();
		this.refreshPlaceholderState();
	}

	removeSlashCommandPreview(): void {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return;
		}

		const commandToken = inputEl.querySelector('[data-kind="command"]');
		if (commandToken instanceof HTMLElement) {
			commandToken.remove();
			this.refreshPlaceholderState();
			this.focus();
			return;
		}

		const value = this.getText();
		const match = value.match(/^(\s*)\/\S+\s*/);
		if (!match) {
			return;
		}

		this.setText(value.slice(match[0].length));
		this.focus();
	}

	private serializeNode(node: Node): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent ?? '';
		}

		if (!(node instanceof HTMLElement)) {
			return '';
		}

		if (node.dataset.kind === 'attachment' || node.dataset.kind === 'command') {
			return node.dataset.rawText ?? node.innerText ?? '';
		}

		if (node.tagName === 'BR') {
			return '\n';
		}

		return Array.from(node.childNodes).map((child) => this.serializeNode(child)).join('');
	}

	private serializeFragment(fragment: DocumentFragment): string {
		return Array.from(fragment.childNodes).map((child) => this.serializeNode(child)).join('');
	}

	private isSelectionInsideComposer(): boolean {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return false;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}

		const range = selection.getRangeAt(0);
		return inputEl.contains(range.startContainer) && inputEl.contains(range.endContainer);
	}

	private getCurrentTextNodeContext(rangeOverride?: Range | null): { textNode: Text; offset: number; textBefore: string; textAfter: string } | null {
		const inputEl = this.deps.getInputEl();
		if (!inputEl) {
			return null;
		}

		const range = rangeOverride ?? (() => {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) {
				return null;
			}
			return selection.getRangeAt(0);
		})();
		if (!range) {
			return null;
		}

		let node = range.startContainer;
		let offset = range.startOffset;

		if (node.nodeType !== Node.TEXT_NODE) {
			if (node instanceof HTMLElement) {
				const before = offset > 0 ? node.childNodes[offset - 1] : null;
				const at = offset < node.childNodes.length ? node.childNodes[offset] : null;

				if (before?.nodeType === Node.TEXT_NODE) {
					node = before;
					offset = before.textContent?.length ?? 0;
				} else if (at?.nodeType === Node.TEXT_NODE) {
					node = at;
					offset = 0;
				} else {
					const textNode = document.createTextNode('');
					node.insertBefore(textNode, at ?? null);
					node = textNode;
					offset = 0;
				}
			}
		}

		if (node.nodeType !== Node.TEXT_NODE) {
			return null;
		}

		const textNode = node as Text;
		const text = textNode.textContent ?? '';
		return {
			textNode,
			offset,
			textBefore: text.slice(0, offset),
			textAfter: text.slice(offset),
		};
	}

	private createInlineTokenElement(config: InlineTokenConfig): HTMLSpanElement {
		const token = document.createElement('span');
		token.contentEditable = 'false';
		token.dataset.kind = config.kind;
		token.dataset.tokenId = config.id;
		token.dataset.rawText = config.rawText;
		if (config.removableId) {
			token.dataset.removableId = config.removableId;
		}
		token.style.display = 'inline-flex';
		token.style.alignItems = 'center';
		token.style.gap = '0.18rem';
		token.style.margin = '0 0.04rem';
		token.style.padding = '0.06rem 0.24rem';
		token.style.borderRadius = '3px';
		token.style.verticalAlign = 'baseline';
		token.style.maxWidth = '260px';
		token.style.border = 'none';
		token.style.lineHeight = '1.35';
		token.style.background = 'var(--background-modifier-hover)';
		token.style.color = config.kind === 'command'
			? 'var(--interactive-accent)'
			: 'var(--text-normal)';

		const label = document.createElement('span');
		label.textContent = config.label;
		label.style.display = 'inline-block';
		label.style.maxWidth = '220px';
		label.style.overflow = 'hidden';
		label.style.textOverflow = 'ellipsis';
		label.style.whiteSpace = 'nowrap';
		label.style.fontSize = '0.76rem';
		label.style.lineHeight = '1.35';
		token.appendChild(label);

		const remove = document.createElement('button');
		remove.type = 'button';
		remove.textContent = '℅';
		remove.style.background = 'transparent';
		remove.style.border = 'none';
		remove.style.boxShadow = 'none';
		remove.style.outline = 'none';
		remove.style.appearance = 'none';
		remove.style.webkitAppearance = 'none';
		remove.style.color = 'inherit';
		remove.style.cursor = 'pointer';
		remove.style.padding = '0';
		remove.style.margin = '0';
		remove.style.minWidth = '0';
		remove.style.width = 'auto';
		remove.style.height = 'auto';
		remove.style.fontSize = '0.7rem';
		remove.style.lineHeight = '1.1';
		remove.style.opacity = '0';
		remove.style.pointerEvents = 'none';
		remove.style.transition = 'opacity 120ms ease';

		remove.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (config.kind === 'attachment' && config.removableId) {
				this.deps.onAttachmentRemove(config.removableId);
			}
			token.remove();
			this.refreshPlaceholderState();
			this.focus();
		});

		token.addEventListener('mouseenter', () => {
			remove.style.opacity = '0.72';
			remove.style.pointerEvents = 'auto';
		});
		token.addEventListener('mouseleave', () => {
			remove.style.opacity = '0';
			remove.style.pointerEvents = 'none';
		});
		remove.addEventListener('focus', () => {
			remove.style.opacity = '0.72';
			remove.style.pointerEvents = 'auto';
		});
		remove.addEventListener('blur', () => {
			remove.style.opacity = '0';
			remove.style.pointerEvents = 'none';
		});

		token.appendChild(remove);
		return token;
	}
}
