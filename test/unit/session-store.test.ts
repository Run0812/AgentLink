import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStore } from '../../src/services/session-store';

describe('SessionStore', () => {
	let store: SessionStore;

	beforeEach(() => {
		store = new SessionStore();
	});

	it('starts empty', () => {
		expect(store.length).toBe(0);
		expect(store.getMessages()).toEqual([]);
	});

	it('addMessage adds a message and returns it', () => {
		const msg = store.addMessage('user', 'hello');
		expect(msg.role).toBe('user');
		expect(msg.content).toBe('hello');
		expect(msg.id).toBeTruthy();
		expect(msg.timestamp).toBeGreaterThan(0);
		expect(store.length).toBe(1);
	});

	it('addMessage generates unique ids', () => {
		const msg1 = store.addMessage('user', 'a');
		const msg2 = store.addMessage('user', 'b');
		expect(msg1.id).not.toBe(msg2.id);
	});

	it('updateMessage updates content of existing message', () => {
		const msg = store.addMessage('assistant', '');
		store.updateMessage(msg.id, 'updated');
		const messages = store.getMessages();
		expect(messages[0].content).toBe('updated');
	});

	it('updateMessage does nothing for unknown id', () => {
		store.addMessage('user', 'hello');
		store.updateMessage('nonexistent', 'nope');
		expect(store.getMessages()[0].content).toBe('hello');
	});

	it('getMessages returns a copy', () => {
		store.addMessage('user', 'a');
		const msgs = store.getMessages();
		msgs.push({ id: 'fake', role: 'user', content: 'b', timestamp: 0 });
		expect(store.length).toBe(1);
	});

	it('getRecentMessages returns last N messages', () => {
		store.addMessage('user', 'a');
		store.addMessage('assistant', 'b');
		store.addMessage('user', 'c');

		const recent = store.getRecentMessages(2);
		expect(recent).toHaveLength(2);
		expect(recent[0].content).toBe('b');
		expect(recent[1].content).toBe('c');
	});

	it('clear empties the store', () => {
		store.addMessage('user', 'a');
		store.addMessage('user', 'b');
		store.clear();
		expect(store.length).toBe(0);
		expect(store.getMessages()).toEqual([]);
	});
});
