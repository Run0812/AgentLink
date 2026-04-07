import { describe, it, expect } from 'vitest';
import { parseEnvString, parseBridgeArgs } from '../../src/settings/settings';

describe('parseEnvString', () => {
	it('parses KEY=VALUE pairs', () => {
		const result = parseEnvString('FOO=bar\nBAZ=qux');
		expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
	});

	it('ignores empty lines and comments', () => {
		const result = parseEnvString('# comment\n\nKEY=val\n  \n#another');
		expect(result).toEqual({ KEY: 'val' });
	});

	it('handles values with = sign', () => {
		const result = parseEnvString('KEY=a=b=c');
		expect(result).toEqual({ KEY: 'a=b=c' });
	});

	it('returns empty object for empty input', () => {
		expect(parseEnvString('')).toEqual({});
	});
});

describe('parseBridgeArgs', () => {
	it('splits space-separated arguments', () => {
		expect(parseBridgeArgs('-p --verbose')).toEqual(['-p', '--verbose']);
	});

	it('returns empty array for empty input', () => {
		expect(parseBridgeArgs('')).toEqual([]);
		expect(parseBridgeArgs('   ')).toEqual([]);
	});

	it('trims leading/trailing whitespace', () => {
		expect(parseBridgeArgs('  -a -b  ')).toEqual(['-a', '-b']);
	});
});
