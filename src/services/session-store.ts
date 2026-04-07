/* ────────────────────────────────────────────────────────────────────────
 * SessionStore — in-memory conversation management.
 * ──────────────────────────────────────────────────────────────────────── */

import { ChatMessage, generateId, MessageRole } from '../core/types';

export class SessionStore {
	private messages: ChatMessage[] = [];

	/** Add a message and return the created ChatMessage. */
	addMessage(role: MessageRole, content: string): ChatMessage {
		const msg: ChatMessage = {
			id: generateId(),
			role,
			content,
			timestamp: Date.now(),
		};
		this.messages.push(msg);
		return msg;
	}

	/** Update the content of an existing message (used for streaming appends). */
	updateMessage(id: string, content: string): void {
		const msg = this.messages.find((m) => m.id === id);
		if (msg) {
			msg.content = content;
		}
	}

	/** Get all messages in the current session. */
	getMessages(): ChatMessage[] {
		return [...this.messages];
	}

	/** Get the last N messages (useful for limiting context). */
	getRecentMessages(count: number): ChatMessage[] {
		return this.messages.slice(-count);
	}

	/** Clear the session history. */
	clear(): void {
		this.messages = [];
	}

	/** Get the total number of messages. */
	get length(): number {
		return this.messages.length;
	}
}
