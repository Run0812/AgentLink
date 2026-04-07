export type AgentType = 'claude' | 'kimi' | 'codex' | 'opencode';

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

export interface AgentResponse {
	success: boolean;
	content: string;
	error?: string;
}

export interface ConversationContext {
	messages: Message[];
	fileContent?: string;
	selectedText?: string;
}
