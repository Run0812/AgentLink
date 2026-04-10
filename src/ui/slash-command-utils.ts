import { BUILTIN_COMMANDS } from '../core/types';

export interface BuiltinSlashCommandSuggestion {
	id: string;
	label: string;
	description: string;
	icon: string;
	source: 'builtin';
}

export interface ParsedBuiltinSlashCommand {
	commandId: string;
	args: string;
}

const BUILTIN_ICONS: Record<string, string> = {
	clear: '/',
	help: '/',
};

export function createBuiltinSlashCommandSuggestions(): BuiltinSlashCommandSuggestion[] {
	return BUILTIN_COMMANDS.map((command) => ({
		id: command.id,
		label: command.label,
		description: command.description,
		icon: BUILTIN_ICONS[command.id] ?? '/',
		source: 'builtin',
	}));
}

export function parseBuiltinSlashCommandPrompt(prompt: string): ParsedBuiltinSlashCommand | null {
	const trimmed = prompt.trim();
	if (!trimmed.startsWith('/')) {
		return null;
	}

	const [firstToken, ...rest] = trimmed.split(/\s+/);
	const commandId = firstToken.slice(1);
	if (!BUILTIN_COMMANDS.some((command) => command.id === commandId)) {
		return null;
	}

	return {
		commandId,
		args: rest.join(' ').trim(),
	};
}
