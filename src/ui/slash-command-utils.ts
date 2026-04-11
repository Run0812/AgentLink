import { BUILTIN_COMMANDS } from '../core/types';
import type { AvailableCommand } from '../core/types';

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

export interface SlashCommandPreview {
	commandId: string;
	label: string;
	description?: string;
	source: 'builtin' | 'agent';
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

export function getSlashCommandPreview(
	prompt: string,
	availableCommands: AvailableCommand[] = [],
): SlashCommandPreview | null {
	const trimmedStart = prompt.trimStart();
	if (!trimmedStart.startsWith('/')) {
		return null;
	}

	const [firstToken] = trimmedStart.split(/\s+/, 1);
	const commandId = firstToken.slice(1);
	if (!commandId) {
		return null;
	}

	const builtin = BUILTIN_COMMANDS.find((command) => command.id === commandId);
	if (builtin) {
		return {
			commandId,
			label: builtin.label,
			description: builtin.description,
			source: 'builtin',
		};
	}

	const agentCommand = availableCommands.find((command) => command.name === commandId);
	if (agentCommand) {
		return {
			commandId,
			label: `/${agentCommand.name}`,
			description: agentCommand.input?.hint
				? `${agentCommand.description} (${agentCommand.input.hint})`
				: agentCommand.description,
			source: 'agent',
		};
	}

	return {
		commandId,
		label: `/${commandId}`,
		source: 'agent',
	};
}
