/* ────────────────────────────────────────────────────────────────────────
 * SessionManager — persistent conversation history management.
 * 
 * Responsibilities:
 *   - Save/load sessions to/from Obsidian plugin data storage
 *   - List all saved sessions
 *   - Auto-generate session titles
 *   - Delete old sessions
 * ──────────────────────────────────────────────────────────────────────── */

import { Plugin } from 'obsidian';
import { ChatMessage, generateId } from '../core/types';
import { loadStoredSessions, saveStoredSessions } from './plugin-data-storage';

export interface SessionMetadata {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	backendId?: string;
}

export interface SessionData {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: ChatMessage[];
	backendId?: string;
	// Computed property for metadata
	messageCount?: number;
}

const MAX_SESSIONS = 50; // Keep last 50 sessions

export class SessionManager {
	private plugin: Plugin;
	private sessions: Map<string, SessionData> = new Map();
	private currentSessionId: string | null = null;
	private historyExpiryDays = 0;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/** Initialize and load existing sessions from storage */
	async initialize(): Promise<void> {
		const stored = await loadStoredSessions<SessionData>(this.plugin);
		for (const [id, session] of Object.entries(stored)) {
			this.sessions.set(id, session);
		}
		const removed = await this.pruneExpiredSessions();
		console.log(`[SessionManager] Loaded ${this.sessions.size} sessions${removed > 0 ? ` (${removed} expired removed)` : ''}`);
	}

	async setHistoryExpiryDays(days: number): Promise<void> {
		this.historyExpiryDays = Math.max(0, Math.floor(days));
		await this.pruneExpiredSessions();
	}

	/** Save all sessions to storage */
	private async persist(): Promise<void> {
		await saveStoredSessions(this.plugin, Object.fromEntries(this.sessions));
	}

	/** Create a new session */
	createSession(title?: string): SessionData {
		const id = generateId();
		const now = Date.now();
		const session: SessionData = {
			id,
			title: title || 'New Chat',
			createdAt: now,
			updatedAt: now,
			messages: [],
		};
		this.sessions.set(id, session);
		this.currentSessionId = id;
		void this.persist();
		return session;
	}

	/** Get current session ID */
	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	/** Set current session */
	setCurrentSession(sessionId: string): boolean {
		if (this.sessions.has(sessionId)) {
			this.currentSessionId = sessionId;
			return true;
		}
		return false;
	}

	/** Get a session by ID */
	getSession(sessionId: string): SessionData | undefined {
		return this.sessions.get(sessionId);
	}

	/** Get current session */
	getCurrentSession(): SessionData | undefined {
		if (this.currentSessionId) {
			return this.sessions.get(this.currentSessionId);
		}
		return undefined;
	}

	/** Update session messages */
	async updateSession(sessionId: string, messages: ChatMessage[], backendId?: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.messages = [...messages];
			session.updatedAt = Date.now();
			if (backendId) {
				session.backendId = backendId;
			}
			
			// Auto-generate title if still default and has messages
			if (session.title === 'New Chat' && messages.length >= 2) {
				session.title = this.generateTitle(messages);
			}
			
			await this.persist();
		}
	}

	/** Rename a session */
	async renameSession(sessionId: string, newTitle: string): Promise<boolean> {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.title = newTitle;
			session.updatedAt = Date.now();
			await this.persist();
			return true;
		}
		return false;
	}

	/** Delete a session */
	async deleteSession(sessionId: string): Promise<boolean> {
		const deleted = this.sessions.delete(sessionId);
		if (deleted) {
			if (this.currentSessionId === sessionId) {
				this.currentSessionId = null;
			}
			await this.persist();
		}
		return deleted;
	}

	/** Delete multiple sessions in one operation. */
	async deleteSessions(
		sessionIds: string[],
		options?: { allowCurrent?: boolean }
	): Promise<{ deleted: number; skippedCurrent: number }> {
		const allowCurrent = options?.allowCurrent ?? false;
		const uniqueIds = new Set(sessionIds);
		let deleted = 0;
		let skippedCurrent = 0;

		for (const sessionId of uniqueIds) {
			if (!allowCurrent && sessionId === this.currentSessionId) {
				skippedCurrent++;
				continue;
			}
			if (this.sessions.delete(sessionId)) {
				deleted++;
			}
		}

		if (deleted > 0) {
			await this.persist();
		}

		return { deleted, skippedCurrent };
	}

	/** Get all session metadata (for list view) */
	getAllSessions(): SessionMetadata[] {
		const removedExpired = this.pruneExpiredSessionsSync();
		if (removedExpired > 0) {
			void this.persist();
		}

		return Array.from(this.sessions.values())
			.map(s => ({
				id: s.id,
				title: s.title,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
				messageCount: s.messages.length,
				backendId: s.backendId,
			}))
			.sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first
	}

	/** Clear all sessions, optionally preserving the current one. */
	async clearAllSessions(options?: { keepCurrent?: boolean }): Promise<number> {
		const keepCurrent = options?.keepCurrent ?? false;
		const preservedSessionId = keepCurrent ? this.currentSessionId : null;

		if (preservedSessionId && this.sessions.has(preservedSessionId)) {
			const removed = Math.max(0, this.sessions.size - 1);
			const preserved = this.sessions.get(preservedSessionId);
			this.sessions.clear();
			if (preserved) {
				this.sessions.set(preservedSessionId, preserved);
			}
			await this.persist();
			return removed;
		}

		const removed = this.sessions.size;
		this.sessions.clear();
		this.currentSessionId = null;
		await this.persist();
		return removed;
	}

	/** Generate a title from the first user message */
	private generateTitle(messages: ChatMessage[]): string {
		// Find first user message
		const firstUserMsg = messages.find(m => m.role === 'user');
		if (firstUserMsg) {
			const text = firstUserMsg.content.trim();
			// Truncate to ~30 chars
			if (text.length > 30) {
				return text.substring(0, 27) + '...';
			}
			return text || 'Chat';
		}
		return 'Chat';
	}

	/** Clean up old sessions if exceeding limit */
	async cleanupOldSessions(): Promise<void> {
		const removedExpired = await this.pruneExpiredSessions();
		if (this.sessions.size > MAX_SESSIONS) {
			const sorted = this.getAllSessions();
			const toDelete = sorted.slice(MAX_SESSIONS);
			for (const meta of toDelete) {
				this.sessions.delete(meta.id);
			}
			await this.persist();
			console.log(`[SessionManager] Cleaned up ${toDelete.length} old sessions${removedExpired > 0 ? ` (${removedExpired} expired)` : ''}`);
		}
	}

	async removeExpiredSessions(): Promise<number> {
		return await this.pruneExpiredSessions();
	}

	private async pruneExpiredSessions(now = Date.now()): Promise<number> {
		const removed = this.pruneExpiredSessionsSync(now);
		if (removed > 0) {
			await this.persist();
		}
		return removed;
	}

	private pruneExpiredSessionsSync(now = Date.now()): number {
		if (this.historyExpiryDays <= 0) {
			return 0;
		}

		const expiryMs = this.historyExpiryDays * 24 * 60 * 60 * 1000;
		let removed = 0;

		for (const [sessionId, session] of this.sessions.entries()) {
			if (sessionId === this.currentSessionId) {
				continue;
			}

			if (now - session.updatedAt > expiryMs) {
				this.sessions.delete(sessionId);
				removed++;
			}
		}

		return removed;
	}
}
