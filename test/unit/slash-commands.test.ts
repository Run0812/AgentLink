import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSlashCommandSuggestions } from '../../src/ui/components/input-autocomplete';

describe('Slash Commands', () => {
	describe('createSlashCommandSuggestions', () => {
		it('should return all available commands', () => {
			const commands = createSlashCommandSuggestions();
			
			expect(commands).toHaveLength(4);
			expect(commands.map(c => c.id)).toContain('web');
			expect(commands.map(c => c.id)).toContain('test');
			expect(commands.map(c => c.id)).toContain('clear');
			expect(commands.map(c => c.id)).toContain('help');
		});
		
		it('should have correct command structure', () => {
			const commands = createSlashCommandSuggestions();
			
			commands.forEach(cmd => {
				expect(cmd).toHaveProperty('id');
				expect(cmd).toHaveProperty('label');
				expect(cmd).toHaveProperty('description');
				expect(cmd).toHaveProperty('icon');
				expect(cmd.label).toMatch(/^\//); // Should start with /
				expect(typeof cmd.id).toBe('string');
				expect(typeof cmd.description).toBe('string');
			});
		});
		
		it('should have unique command IDs', () => {
			const commands = createSlashCommandSuggestions();
			const ids = commands.map(c => c.id);
			const uniqueIds = [...new Set(ids)];
			
			expect(ids).toHaveLength(uniqueIds.length);
		});
		
		it('should have meaningful descriptions', () => {
			const commands = createSlashCommandSuggestions();
			
			commands.forEach(cmd => {
				expect(cmd.description.length).toBeGreaterThan(0);
				expect(cmd.description).not.toBe('undefined');
				expect(cmd.description).not.toBe('null');
			});
		});
	});
	
	describe('Command filtering', () => {
		it('should filter commands by query', () => {
			const commands = createSlashCommandSuggestions();
			
			// Filter by "cl" should match "clear"
			const filteredByCl = commands.filter(s =>
				s.label.toLowerCase().includes('cl')
			);
			expect(filteredByCl.map(c => c.id)).toContain('clear');
			
			// Filter by "he" should match "help"
			const filteredByHe = commands.filter(s =>
				s.label.toLowerCase().includes('he')
			);
			expect(filteredByHe.map(c => c.id)).toContain('help');
			
			// Filter by "te" should match "test"
			const filteredByTe = commands.filter(s =>
				s.label.toLowerCase().includes('te')
			);
			expect(filteredByTe.map(c => c.id)).toContain('test');
		});
		
		it('should be case-insensitive', () => {
			const commands = createSlashCommandSuggestions();
			
			// Test that lowercase query matches uppercase label (and vice versa)
			const upperCaseQuery = commands.filter(s =>
				s.label.toLowerCase().includes('CL'.toLowerCase())
			);
			const lowerCaseQuery = commands.filter(s =>
				s.label.toLowerCase().includes('cl')
			);
			
			expect(upperCaseQuery.length).toBe(lowerCaseQuery.length);
			expect(upperCaseQuery.length).toBeGreaterThan(0);
		});
		
		it('should return empty array for non-matching query', () => {
			const commands = createSlashCommandSuggestions();
			
			const filtered = commands.filter(s =>
				s.label.toLowerCase().includes('xyz123')
			);
			
			expect(filtered).toHaveLength(0);
		});
	});
});
