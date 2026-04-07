import { CancellationError } from '../core/errors';
import {
	AgentAdapter,
	AgentCapability,
	AgentInput,
	AgentStatus,
	AgentStatusState,
	StreamHandlers,
	ToolCall,
	ToolResult,
	TOOL_METADATA,
} from '../core/types';
import { logger } from '../core/logger';

const MOCK_CHUNKS = [
	'Hello! ',
	'I am a **mock** agent. ',
	'This response is streamed ',
	'chunk by chunk to simulate ',
	'a real AI backend.\n\n',
	'You can use me to verify ',
	'that the UI works correctly ',
	'without needing any real model.',
];

const MOCK_THINKING_CHUNKS = [
	'<thinking>\n',
	'Let me analyze this request...\n',
	'1. User wants to test the mock adapter\n',
	'2. I should provide a helpful response\n',
	'3. Demonstrating streaming and tool calls\n',
	'</thinking>\n\n',
];

/**
 * MockAdapter — simulates a streaming AI backend for UI testing.
 *
 * Updated to support:
 * - Tool call simulation (trigger with "tool:" or "read file" in prompt)
 * - Thinking process display (trigger with "think" or "analyze" in prompt)
 * - File edit simulation (trigger with "edit" or "modify" in prompt)
 * - Tool result handling for multi-turn conversation
 */
export class MockAdapter implements AgentAdapter {
	readonly id = 'mock';
	readonly label = 'Mock Agent';

	private state: AgentStatusState = 'disconnected';
	private cancelled = false;
	private currentTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingToolCall: ToolCall | null = null;
	private lastToolResult: ToolResult | null = null;

	async connect(): Promise<void> {
		this.state = 'connecting';
		logger.debug('MockAdapter: connecting…');
		await this.sleep(200);
		this.state = 'connected';
		logger.info('MockAdapter: connected');
	}

	async disconnect(): Promise<void> {
		await this.cancel();
		this.state = 'disconnected';
		logger.info('MockAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state !== 'connected') {
			await this.connect();
		}
		this.cancelled = false;
		this.state = 'busy';
		logger.debug('MockAdapter: sendMessage', input.prompt);

		const prompt = input.prompt.toLowerCase();

		// Check if this is a tool result response (from previous tool call)
		if (this.pendingToolCall && this.lastToolResult) {
			await this.simulateToolResultResponse(handlers);
			return;
		}

		// Handle error simulation
		if (prompt.includes('error')) {
			this.state = 'connected';
			handlers.onError(new Error('Mock error: you asked for it!'));
			return;
		}

		// Handle terminal command simulation
		if (prompt.includes('terminal:') || prompt.includes('run command')) {
			await this.simulateTerminalCommand(input.prompt, handlers);
			return;
		}

		// Handle tool call simulation
		if (prompt.includes('tool:') || prompt.includes('read file') || prompt.includes('list files')) {
			await this.simulateToolCall(input.prompt, handlers);
			return;
		}

		// Handle file edit simulation
		if (prompt.includes('edit') || prompt.includes('modify') || prompt.includes('change')) {
			await this.simulateFileEdit(input.prompt, handlers);
			return;
		}

		// Handle thinking simulation
		if (prompt.includes('think') || prompt.includes('analyze') || prompt.includes('reason')) {
			await this.simulateWithThinking(handlers);
			return;
		}

		// Default streaming response
		await this.simulateDefaultResponse(input.prompt, handlers);
	}

	async cancel(): Promise<void> {
		logger.debug('MockAdapter: cancel requested');
		this.cancelled = true;
		if (this.currentTimer !== null) {
			clearTimeout(this.currentTimer);
			this.currentTimer = null;
		}
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	// ── New Interface Methods ────────────────────────────────────────────

	getCapabilities(): AgentCapability[] {
		return ['chat', 'file_read', 'file_write', 'file_edit'];
	}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		logger.debug('MockAdapter: executing tool', call.tool, call.params);

		// Store the tool call and result for potential follow-up
		this.pendingToolCall = call;
		const result = await this.mockExecuteTool(call);
		this.lastToolResult = result;
		return result;
	}

	private async mockExecuteTool(call: ToolCall): Promise<ToolResult> {
		const { tool, params } = call;

		switch (tool) {
			case 'read_file': {
				const path = params.path as string;
				return {
					success: true,
					content: `# Mock File Content: ${path}\n\nThis is simulated content for ${path}.\n\n- Item 1\n- Item 2\n- Item 3`,
					metadata: { path, mock: true },
				};
			}

			case 'list_dir': {
				const path = (params.path as string) || '.';
				return {
					success: true,
					content: JSON.stringify({
						path,
						entries: [
							{ name: 'README.md', type: 'file' },
							{ name: 'src', type: 'directory' },
							{ name: 'docs', type: 'directory' },
							{ name: 'package.json', type: 'file' },
						],
					}),
					metadata: { path, mock: true },
				};
			}

			case 'write_file':
			case 'edit_file': {
				const path = params.path as string;
				const content = params.content as string;
				return {
					success: true,
					content: `File ${path} has been ${tool === 'write_file' ? 'written' : 'edited'}.`,
					metadata: { path, size: content.length, mock: true },
				};
			}

			case 'terminal': {
				const command = params.command as string;
				return {
					success: true,
					content: `$ ${command}\nMock terminal output\nLine 1\nLine 2\nLine 3`,
					metadata: { command, exitCode: 0, mock: true },
				};
			}

			case 'search': {
				const query = params.query as string;
				return {
					success: true,
					content: JSON.stringify([
						{ path: 'file1.md', line: 10, content: `Found "${query}" here` },
						{ path: 'file2.md', line: 25, content: `Another occurrence of "${query}"` },
					]),
					metadata: { query, results: 2, mock: true },
				};
			}

			default:
				return {
					success: false,
					content: `Unknown tool: ${tool}`,
					metadata: { availableTools: Object.keys(TOOL_METADATA) },
				};
		}
	}

	// ── Simulation Helpers ───────────────────────────────────────────────

	private async simulateDefaultResponse(prompt: string, handlers: StreamHandlers): Promise<void> {
		let accumulated = '';
		try {
			for (const chunk of MOCK_CHUNKS) {
				if (this.cancelled) {
					throw new CancellationError();
				}
				await this.sleep(150 + Math.random() * 200);
				if (this.cancelled) {
					throw new CancellationError();
				}
				accumulated += chunk;
				handlers.onChunk(chunk);
			}
			const echo = `\n\n> You said: "${prompt}"`;
			accumulated += echo;
			handlers.onChunk(echo);
			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private async simulateWithThinking(handlers: StreamHandlers): Promise<void> {
		let accumulated = '';
		try {
			// First send thinking chunks
			for (const chunk of MOCK_THINKING_CHUNKS) {
				if (this.cancelled) throw new CancellationError();
				await this.sleep(100);
				if (this.cancelled) throw new CancellationError();
				accumulated += chunk;
				handlers.onChunk(chunk);
			}

			// Then send normal response
			const response = 'Based on my analysis, I can help you test the AgentLink plugin! ' +
				'You\'re seeing the thinking process above, which can be toggled in settings.';
			accumulated += response;
			handlers.onChunk(response);

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private async simulateToolCall(prompt: string, handlers: StreamHandlers): Promise<void> {
		let accumulated = '';
		try {
			// Extract potential filename from prompt
			const fileMatch = prompt.match(/(?:read|tool:)\s*(\S+)/i);
			const filename = fileMatch ? fileMatch[1] : 'example.md';

			const intro = `I'll help you read that file. Let me fetch it for you.\n\n`;
			accumulated += intro;
			handlers.onChunk(intro);
			await this.sleep(300);

			if (this.cancelled) throw new CancellationError();

			// Signal that a tool call is being made (this would normally be parsed from response)
			const toolCallJson = `\`\`\`json\n{"type":"tool_call","id":"tool_123","tool":"read_file","params":{"path":"${filename}"}}\n\`\`\`\n\n`;
			accumulated += toolCallJson;
			handlers.onChunk(toolCallJson);

			await this.sleep(200);
			if (this.cancelled) throw new CancellationError();

			const result = `File contents:\n\`\`\`markdown\n# ${filename}\n\nThis is mock content for ${filename}.\n\nIn real usage, the Agent would wait for your confirmation before reading this file.\n\`\`\``;
			accumulated += result;
			handlers.onChunk(result);

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private async simulateFileEdit(prompt: string, handlers: StreamHandlers): Promise<void> {
		let accumulated = '';
		try {
			const intro = `I'll help you edit that file. Here's the proposed change:\n\n`;
			accumulated += intro;
			handlers.onChunk(intro);
			await this.sleep(300);

			if (this.cancelled) throw new CancellationError();

			const diff = `\`\`\`diff\n--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,4 @@\n # Example File\n \n-Original content here.\n+Updated content here.\n+This change was suggested by the Agent.\n\`\`\`\n\n`;
			accumulated += diff;
			handlers.onChunk(diff);

			await this.sleep(200);
			if (this.cancelled) throw new CancellationError();

			const note = `**Note:** In real usage, you would see a confirmation dialog before this edit is applied.`;
			accumulated += note;
			handlers.onChunk(note);

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private async simulateToolResultResponse(handlers: StreamHandlers): Promise<void> {
		// Respond to the result of a previous tool call
		const toolCall = this.pendingToolCall!;
		const result = this.lastToolResult!;
		let accumulated = '';

		try {
			const response = `I've received the result from the ${toolCall.tool} operation. `;
			accumulated += response;
			handlers.onChunk(response);
			await this.sleep(200);

			if (this.cancelled) throw new CancellationError();

			if (result.success) {
				const successMsg = `The operation was successful. Here's a summary:\n\n${result.content.slice(0, 200)}${result.content.length > 200 ? '...' : ''}`;
				accumulated += successMsg;
				handlers.onChunk(successMsg);
			} else {
				const errorMsg = `The operation failed with error: ${result.content}`;
				accumulated += errorMsg;
				handlers.onChunk(errorMsg);
			}

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		} finally {
			// Clear the pending tool call
			this.pendingToolCall = null;
			this.lastToolResult = null;
		}
	}

	private async simulateTerminalCommand(prompt: string, handlers: StreamHandlers): Promise<void> {
		let accumulated = '';
		try {
			// Extract command from prompt
			const cmdMatch = prompt.match(/(?:terminal:|run command)\s*(.+)/i);
			const command = cmdMatch ? cmdMatch[1] : 'echo "Hello World"';

			const intro = `I'll execute that command for you.\n\n`;
			accumulated += intro;
			handlers.onChunk(intro);
			await this.sleep(300);

			if (this.cancelled) throw new CancellationError();

			// Store the pending tool call
			this.pendingToolCall = {
				id: `tool_${Date.now()}`,
				tool: 'terminal',
				params: { command },
			};

			// Signal that a tool call is being made
			const toolCallJson = `\`\`\`json\n{"type":"tool_call","id":"${this.pendingToolCall.id}","tool":"terminal","params":{"command":"${command}"}}\n\`\`\`\n\n`;
			accumulated += toolCallJson;
			handlers.onChunk(toolCallJson);

			await this.sleep(200);
			if (this.cancelled) throw new CancellationError();

			const note = `⚠️ **Note:** In real usage, you would need to confirm this terminal command before execution for security reasons.`;
			accumulated += note;
			handlers.onChunk(note);

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.currentTimer = setTimeout(() => {
				this.currentTimer = null;
				resolve();
			}, ms);
		});
	}
}
