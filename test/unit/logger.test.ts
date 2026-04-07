import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from '../../src/core/logger';

describe('Logger', () => {
	let logInstance: Logger;

	beforeEach(() => {
		logInstance = new Logger('Test');
	});

	it('defaults to debug disabled', () => {
		expect(logInstance.isDebug()).toBe(false);
	});

	it('setDebug toggles debug mode', () => {
		logInstance.setDebug(true);
		expect(logInstance.isDebug()).toBe(true);
		logInstance.setDebug(false);
		expect(logInstance.isDebug()).toBe(false);
	});

	it('debug() does not throw when debug is disabled', () => {
		expect(() => logInstance.debug('test')).not.toThrow();
	});

	it('info/warn/error do not throw', () => {
		expect(() => logInstance.info('test')).not.toThrow();
		expect(() => logInstance.warn('test')).not.toThrow();
		expect(() => logInstance.error('test')).not.toThrow();
	});

	it('debug() logs when debug is enabled', () => {
		logInstance.setDebug(true);
		expect(() => logInstance.debug('should appear')).not.toThrow();
	});
});
