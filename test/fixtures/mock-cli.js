#!/usr/bin/env node
/**
 * Mock CLI agent for testing.
 *
 * Reads stdin, then streams a response to stdout word-by-word with a
 * small delay between each word to simulate streaming.
 *
 * Usage:
 *   echo "Hello" | node test/fixtures/mock-cli.js
 *
 * Special inputs:
 *   - "error" → writes to stderr and exits with code 1
 *   - "slow"  → delays 5 seconds before responding
 */

const chunks = [];

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (data) => chunks.push(data));
process.stdin.on('end', async () => {
	const input = chunks.join('').trim();

	if (input.toLowerCase().includes('error')) {
		process.stderr.write('Mock CLI error: you asked for it!\n');
		process.exit(1);
	}

	const words = [
		'Hello', 'from', 'mock', 'CLI.', 'You', 'said:', `"${input}".`,
	];

	for (const word of words) {
		process.stdout.write(word + ' ');
		await new Promise((r) => setTimeout(r, 50));
	}
	process.stdout.write('\n');
});
