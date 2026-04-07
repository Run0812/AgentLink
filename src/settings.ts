import { AgentType } from './types';

export interface AgentConfig {
	enabled: boolean;
	/** Path to binary (for CLI-based agents) */
	binaryPath: string;
	/** API key (for HTTP-based agents) */
	apiKey: string;
	/** API endpoint URL */
	endpoint: string;
	/** Model name to use */
	model: string;
	/** Additional CLI arguments */
	extraArgs: string;
	/** Connection mode: 'cli' or 'http' */
	mode: 'cli' | 'http';
}

export interface AgentLinkSettings {
	activeAgent: AgentType;
	agents: Record<AgentType, AgentConfig>;
	maxContextLength: number;
	includeFileContext: boolean;
	systemPrompt: string;
}

export const DEFAULT_SETTINGS: AgentLinkSettings = {
	activeAgent: 'claude',
	maxContextLength: 8000,
	includeFileContext: false,
	systemPrompt: 'You are a helpful AI assistant integrated with Obsidian.',
	agents: {
		claude: {
			enabled: true,
			mode: 'cli',
			binaryPath: 'claude',
			apiKey: '',
			endpoint: '',
			model: '',
			extraArgs: '',
		},
		kimi: {
			enabled: false,
			mode: 'http',
			binaryPath: 'kimi',
			apiKey: '',
			endpoint: 'https://api.moonshot.cn/v1',
			model: 'moonshot-v1-8k',
			extraArgs: '',
		},
		codex: {
			enabled: false,
			mode: 'http',
			binaryPath: 'codex',
			apiKey: '',
			endpoint: 'https://api.openai.com/v1',
			model: 'gpt-4o',
			extraArgs: '',
		},
		opencode: {
			enabled: false,
			mode: 'cli',
			binaryPath: 'opencode',
			apiKey: '',
			endpoint: 'http://localhost:3000',
			model: '',
			extraArgs: '',
		},
	},
};
