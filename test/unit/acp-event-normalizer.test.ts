import { describe, expect, it } from 'vitest';
import { normalizePermissionToolCall, normalizeSessionUpdate } from '../../src/acp/acp-event-normalizer';

describe('ACP event normalizer', () => {
	it('normalizes text chunks', () => {
		expect(
			normalizeSessionUpdate({
				sessionUpdate: 'agent_message_chunk',
				content: { type: 'text', text: 'hello' },
			}),
		).toEqual({ kind: 'message_chunk', text: 'hello' });
	});

	it('normalizes tool calls with JSON params', () => {
		expect(
			normalizeSessionUpdate({
				sessionUpdate: 'tool_call',
				toolCallId: 'tool-1',
				toolName: 'read_file',
				title: 'Read file',
				status: 'in_progress',
				arguments: '{"path":"README.md"}',
			}),
		).toEqual({
			kind: 'tool_call',
			toolCallId: 'tool-1',
			tool: 'read_file',
			title: 'Read file',
			status: 'in_progress',
			params: { path: 'README.md' },
		});
	});

	it('normalizes plan updates with complete entries', () => {
		expect(
			normalizeSessionUpdate({
				sessionUpdate: 'plan',
				entries: [
					{ content: 'Analyze codebase', priority: 'high', status: 'pending' },
					{ content: 'Refactor module', priority: 'medium', status: 'in_progress' },
				],
			}),
		).toEqual({
			kind: 'plan',
			entries: [
				{ content: 'Analyze codebase', priority: 'high', status: 'pending' },
				{ content: 'Refactor module', priority: 'medium', status: 'in_progress' },
			],
		});
	});

	it('normalizes empty plan updates', () => {
		expect(
			normalizeSessionUpdate({
				sessionUpdate: 'plan',
				entries: [],
			}),
		).toEqual({
			kind: 'plan',
			entries: [],
		});
	});

	it('returns null for invalid plan payloads', () => {
		expect(
			normalizeSessionUpdate({
				sessionUpdate: 'plan',
				entries: [{ content: 'Missing status and priority' }],
			}),
		).toBeNull();
	});

	it('returns null for unsupported payloads', () => {
		expect(normalizeSessionUpdate({ sessionUpdate: 'user_message_chunk' })).toBeNull();
	});

	it('normalizes permission tool calls', () => {
		expect(
			normalizePermissionToolCall({
				id: 'permission-1',
				toolName: 'terminal',
				title: 'Run terminal command',
				arguments: '{"command":"echo hello"}',
			}),
		).toEqual({
			id: 'permission-1',
			tool: 'terminal',
			title: 'Run terminal command',
			params: { command: 'echo hello' },
		});
	});
});
