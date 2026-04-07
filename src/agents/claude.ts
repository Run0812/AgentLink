import { execFile } from 'child_process';
import { AgentConfig } from '../settings';
import { AgentResponse, ConversationContext } from '../types';
import { BaseAgent } from './base';

/**
 * Claude Code agent.
 *
 * Communicates with the `claude` CLI tool in print mode:
 *   claude -p "your prompt"
 *
 * Install: https://claude.ai/code
 */
export class ClaudeAgent extends BaseAgent {
	constructor(config: AgentConfig) {
		super('Claude Code', config);
	}

	async send(prompt: string, context: ConversationContext = { messages: [] }): Promise<AgentResponse> {
		const validationError = this.validate();
		if (validationError) {
			return { success: false, content: '', error: validationError };
		}

		const fullPrompt = this.buildPromptString(prompt, context);
		const binary = this.config.binaryPath || 'claude';

		// Build args array: extra args are split and prepended before -p
		const extraArgs = this.config.extraArgs
			? this.config.extraArgs.trim().split(/\s+/).filter(Boolean)
			: [];

		return new Promise((resolve) => {
			// Use execFile (not exec) so the prompt is never parsed by a shell.
			// This eliminates shell-injection risk regardless of prompt content.
			execFile(
				binary,
				[...extraArgs, '-p', fullPrompt],
				{ timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
				(error, stdout, stderr) => {
					if (error) {
						resolve({
							success: false,
							content: '',
							error: stderr || error.message,
						});
						return;
					}
					resolve({ success: true, content: stdout.trim() });
				}
			);
		});
	}

	validate(): string | null {
		if (!this.config.binaryPath) {
			return 'Claude Code: Binary path is required. Install from https://claude.ai/code';
		}
		return null;
	}
}
