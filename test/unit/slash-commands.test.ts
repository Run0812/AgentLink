import { describe, it, expect } from 'vitest';
import {
	buildAgentSlashCommandText,
	createAvailableCommandSuggestions,
	createSlashCommandSuggestions,
} from '../../src/ui/components/input-autocomplete';
import { parseBuiltinSlashCommandPrompt } from '../../src/ui/slash-command-utils';

describe('Slash Commands', () => {
	describe('createSlashCommandSuggestions', () => {
		it('should return all available commands', () => {
			const commands = createSlashCommandSuggestions();

			expect(commands).toHaveLength(2);
			expect(commands.map((c) => c.id)).toContain('clear');
			expect(commands.map((c) => c.id)).toContain('help');
			expect(commands.map((c) => c.id)).not.toContain('web');
			expect(commands.map((c) => c.id)).not.toContain('test');
		});

		it('should have correct command structure', () => {
			const commands = createSlashCommandSuggestions();

			commands.forEach((cmd) => {
				expect(cmd).toHaveProperty('id');
				expect(cmd).toHaveProperty('label');
				expect(cmd).toHaveProperty('description');
				expect(cmd).toHaveProperty('icon');
				expect(cmd.label).toMatch(/^\//);
				expect(typeof cmd.id).toBe('string');
				expect(typeof cmd.description).toBe('string');
			});
		});

		it('should have unique command IDs', () => {
			const commands = createSlashCommandSuggestions();
			const ids = commands.map((c) => c.id);
			const uniqueIds = [...new Set(ids)];

			expect(ids).toHaveLength(uniqueIds.length);
		});
	});

	describe('agent slash commands', () => {
		it('includes input hints in suggestion descriptions', () => {
			const suggestions = createAvailableCommandSuggestions([
				{
					name: 'plan',
					description: 'Show the plan',
					input: { hint: 'optional topic' },
				},
			]);

			expect(suggestions).toEqual([
				expect.objectContaining({
					id: 'plan',
					label: '/plan',
					description: 'Show the plan (optional topic)',
					source: 'agent',
				}),
			]);
		});

		it('builds insertion text with trailing space when input is expected', () => {
			expect(
				buildAgentSlashCommandText({
					name: 'plan',
					description: 'Show the plan',
					input: { hint: 'topic' },
				}),
			).toBe('/plan ');
		});

		it('builds insertion text without trailing space when no input is expected', () => {
			expect(
				buildAgentSlashCommandText({
					name: 'plan',
					description: 'Show the plan',
					input: null,
				}),
			).toBe('/plan');
		});
	});

	describe('command filtering', () => {
		it('should filter commands by query', () => {
			const commands = createSlashCommandSuggestions();

			expect(commands.filter((s) => s.label.toLowerCase().includes('cl')).map((c) => c.id)).toContain('clear');
			expect(commands.filter((s) => s.label.toLowerCase().includes('he')).map((c) => c.id)).toContain('help');
		});

		it('should be case-insensitive', () => {
			const commands = createSlashCommandSuggestions();
			const upperCaseQuery = commands.filter((s) => s.label.toLowerCase().includes('CL'.toLowerCase()));
			const lowerCaseQuery = commands.filter((s) => s.label.toLowerCase().includes('cl'));

			expect(upperCaseQuery.length).toBe(lowerCaseQuery.length);
			expect(upperCaseQuery.length).toBeGreaterThan(0);
		});

		it('should return empty array for non-matching query', () => {
			const commands = createSlashCommandSuggestions();
			const filtered = commands.filter((s) => s.label.toLowerCase().includes('xyz123'));

			expect(filtered).toHaveLength(0);
		});
	});

	describe('builtin slash prompt parsing', () => {
		it('parses a builtin slash command and args', () => {
			expect(parseBuiltinSlashCommandPrompt('/help topic')).toEqual({
				commandId: 'help',
				args: 'topic',
			});
		});

		it('returns null for non-builtin slash commands', () => {
			expect(parseBuiltinSlashCommandPrompt('/web test')).toBeNull();
			expect(parseBuiltinSlashCommandPrompt('/plan')).toBeNull();
		});
	});
});
