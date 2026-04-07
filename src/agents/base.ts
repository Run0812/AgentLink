import { AgentConfig } from '../settings';
import { AgentResponse, ConversationContext } from '../types';

export abstract class BaseAgent {
	protected config: AgentConfig;
	protected name: string;

	constructor(name: string, config: AgentConfig) {
		this.name = name;
		this.config = config;
	}

	getName(): string {
		return this.name;
	}

	isEnabled(): boolean {
		return this.config.enabled;
	}

	updateConfig(config: AgentConfig): void {
		this.config = config;
	}

	/** Send a prompt to the agent and get a response. */
	abstract send(prompt: string, context?: ConversationContext): Promise<AgentResponse>;

	/** Validate the agent configuration before sending. */
	validate(): string | null {
		if (this.config.mode === 'http') {
			if (!this.config.apiKey && !this.config.endpoint.startsWith('http://localhost')) {
				return `${this.name}: API key is required for HTTP mode.`;
			}
			if (!this.config.endpoint) {
				return `${this.name}: Endpoint URL is required for HTTP mode.`;
			}
		}
		if (this.config.mode === 'cli') {
			if (!this.config.binaryPath) {
				return `${this.name}: Binary path is required for CLI mode.`;
			}
		}
		return null;
	}

	/** Build conversation messages array for HTTP APIs. */
	protected buildMessages(
		prompt: string,
		context: ConversationContext,
		systemPrompt?: string
	): Array<{ role: string; content: string }> {
		const messages: Array<{ role: string; content: string }> = [];

		if (systemPrompt) {
			messages.push({ role: 'system', content: systemPrompt });
		}

		// Add conversation history (limited)
		for (const msg of context.messages) {
			messages.push({ role: msg.role, content: msg.content });
		}

		// Build the user prompt with optional context
		let userContent = prompt;
		if (context.selectedText) {
			userContent = `Selected text:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n${prompt}`;
		} else if (context.fileContent) {
			userContent = `File content:\n\`\`\`\n${context.fileContent}\n\`\`\`\n\n${prompt}`;
		}

		messages.push({ role: 'user', content: userContent });
		return messages;
	}

	/** Build a full prompt string for CLI-based agents. */
	protected buildPromptString(prompt: string, context: ConversationContext): string {
		let full = prompt;
		if (context.selectedText) {
			full = `Selected text:\n${context.selectedText}\n\n${prompt}`;
		} else if (context.fileContent) {
			full = `File content:\n${context.fileContent}\n\n${prompt}`;
		}
		return full;
	}
}
