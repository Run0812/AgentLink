import { describe, it, expect } from 'vitest';
import {
	AgentLinkError,
	ConnectionError,
	CommandNotFoundError,
	TimeoutError,
	CancellationError,
	HttpError,
	ProcessExitError,
} from '../../src/core/errors';

describe('Error types', () => {
	it('AgentLinkError is an Error', () => {
		const e = new AgentLinkError('test');
		expect(e).toBeInstanceOf(Error);
		expect(e.name).toBe('AgentLinkError');
		expect(e.message).toBe('test');
	});

	it('ConnectionError extends AgentLinkError', () => {
		const e = new ConnectionError('conn failed');
		expect(e).toBeInstanceOf(AgentLinkError);
		expect(e.name).toBe('ConnectionError');
	});

	it('CommandNotFoundError includes command name', () => {
		const e = new CommandNotFoundError('mybin');
		expect(e).toBeInstanceOf(AgentLinkError);
		expect(e.message).toContain('mybin');
	});

	it('TimeoutError includes duration', () => {
		const e = new TimeoutError(5000);
		expect(e.message).toContain('5000');
	});

	it('CancellationError has correct message', () => {
		const e = new CancellationError();
		expect(e.message).toContain('cancelled');
	});

	it('HttpError stores status code', () => {
		const e = new HttpError(404, 'not found');
		expect(e.statusCode).toBe(404);
		expect(e.message).toContain('404');
	});

	it('ProcessExitError stores exit code', () => {
		const e = new ProcessExitError(1, 'some error');
		expect(e.exitCode).toBe(1);
		expect(e.message).toContain('some error');
	});
});
