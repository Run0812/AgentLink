import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AcpBridgeAdapter, AcpBridgeAdapterConfig } from '../../src/adapters/acp-bridge-adapter';

describe('AcpBridgeAdapter', () => {
	let adapter: AcpBridgeAdapter;

	const defaultConfig: AcpBridgeAdapterConfig = {
		type: 'acp-bridge',
		id: 'test-acp',
		name: 'Test ACP Agent',
		command: '',
		args: [],
	};

	beforeEach(() => {
		adapter = new AcpBridgeAdapter(defaultConfig);
	});

	describe('basic properties', () => {
		it('has correct id', () => {
			expect(adapter.id).toBe('acp-bridge');
		});

		it('has correct label', () => {
			expect(adapter.label).toBe('ACP Bridge');
		});
	});

	describe('getCapabilities', () => {
		it('returns expected capabilities', () => {
			const caps = adapter.getCapabilities();
			expect(caps).toContain('chat');
			expect(caps).toContain('file_read');
			expect(caps).toContain('file_write');
			expect(caps).toContain('file_edit');
			expect(caps).toContain('terminal');
		});
	});

	describe('getStatus', () => {
		it('returns disconnected initially', () => {
			const status = adapter.getStatus();
			expect(status.state).toBe('disconnected');
		});
	});

	describe('executeTool', () => {
		it('returns not implemented message', async () => {
			const result = await adapter.executeTool({
				id: 'test',
				tool: 'read_file',
				params: { path: 'test.md' },
			});

			expect(result.success).toBe(false);
			expect(result.content).toContain('ToolExecutor');
		});
	});

	describe('updateConfig', () => {
		it('updates configuration without errors', () => {
			adapter.updateConfig({ name: 'Updated Name' });
		});
	});

	describe('ACP session state', () => {
		it('uses Obsidian vault base path as working directory when available', () => {
			const adapterWithApp = new AcpBridgeAdapter({
				...defaultConfig,
				app: {
					vault: {
						adapter: {
							getBasePath: () => 'D:\\vault-root',
						},
					},
				} as never,
			});

			const internal = adapterWithApp as unknown as {
				getWorkingDirectory: () => string;
				buildWorkspaceFileUri: (relativePath: string) => string;
			};

			expect(internal.getWorkingDirectory()).toBe('D:\\vault-root');
			expect(internal.buildWorkspaceFileUri('current.md')).toBe('file:///D:/vault-root/current.md');
		});

		it('falls back to process cwd when vault base path is unavailable', () => {
			const internal = adapter as unknown as {
				getWorkingDirectory: () => string;
			};

			expect(internal.getWorkingDirectory()).toBe(process.cwd());
		});

		it('maps available commands including input hints', () => {
			adapter.handleAvailableCommands([
				{ name: 'plan', description: 'Show the plan', input: { hint: 'optional topic' } },
			]);

			expect(adapter.getAvailableCommands()).toEqual([
				{ name: 'plan', description: 'Show the plan', input: { hint: 'optional topic' } },
			]);
		});

		it('falls back to session modes when config options are absent', () => {
			const internal = adapter as unknown as {
				sessionModes: Array<{ id: string; name: string; description?: string }>;
				currentMode: string | null;
			};
			internal.sessionModes = [
				{ id: 'ask', name: 'Ask', description: 'Approval required' },
				{ id: 'code', name: 'Code', description: 'Coding mode' },
			];
			internal.currentMode = 'code';

			expect(adapter.getConfigOptions()).toEqual([
				{
					id: 'mode',
					name: 'Mode',
					description: 'Agent session mode',
					category: 'mode',
					type: 'select',
					currentValue: 'code',
					options: [
						{ value: 'ask', name: 'Ask', description: 'Approval required' },
						{ value: 'code', name: 'Code', description: 'Coding mode' },
					],
				},
			]);
		});

		it('maps select groups and boolean config options', () => {
			adapter.handleConfigOptionUpdate([
				{
					id: 'mode',
					name: 'Mode',
					type: 'select',
					category: 'mode',
					currentValue: 'plan',
					options: [
						{ group: 'safe', name: 'Safe', options: [{ value: 'plan', name: 'Plan', description: 'Read-only' }] },
						{ value: 'code', name: 'Code', description: 'Can edit files' },
					],
				},
				{
					id: 'auto_apply',
					name: 'Auto apply',
					type: 'boolean',
					currentValue: true,
				},
			]);

			expect(adapter.getConfigOptions()).toEqual([
				{
					id: 'mode',
					name: 'Mode',
					description: undefined,
					category: 'mode',
					type: 'select',
					currentValue: 'plan',
					options: [
						{ value: 'plan', name: 'Safe / Plan', description: 'Read-only' },
						{ value: 'code', name: 'Code', description: 'Can edit files' },
					],
				},
				{
					id: 'auto_apply',
					name: 'Auto apply',
					description: undefined,
					category: undefined,
					type: 'boolean',
					currentValue: true,
				},
			]);
		});

		it('uses session/set_config_option when config options exist', async () => {
			const setSessionConfigOption = vi.fn().mockResolvedValue({
				configOptions: [
					{
						id: 'mode',
						name: 'Mode',
						type: 'select',
						currentValue: 'code',
						options: [
							{ value: 'ask', name: 'Ask' },
							{ value: 'code', name: 'Code' },
						],
					},
				],
			});

			const internal = adapter as unknown as {
				connection: { setSessionConfigOption: typeof setSessionConfigOption };
				sessionId: string | null;
				configOptions: unknown[];
			};
			internal.connection = { setSessionConfigOption } as never;
			internal.sessionId = 'session-1';
			internal.configOptions = [
				{
					id: 'mode',
					name: 'Mode',
					type: 'select',
					currentValue: 'ask',
					options: [{ value: 'ask', name: 'Ask' }],
				},
			];

			const updated = await adapter.setConfigOption('mode', 'code');

			expect(setSessionConfigOption).toHaveBeenCalledWith({
				sessionId: 'session-1',
				configId: 'mode',
				value: 'code',
			});
			expect(updated[0]).toMatchObject({ id: 'mode', currentValue: 'code' });
		});

		it('uses session/set_mode fallback when only modes are available', async () => {
			const setSessionMode = vi.fn().mockResolvedValue({});

			const internal = adapter as unknown as {
				connection: { setSessionMode: typeof setSessionMode };
				sessionId: string | null;
				configOptions: unknown[];
				sessionModes: Array<{ id: string; name: string }>;
				currentMode: string | null;
			};
			internal.connection = { setSessionMode } as never;
			internal.sessionId = 'session-1';
			internal.configOptions = [];
			internal.sessionModes = [
				{ id: 'ask', name: 'Ask' },
				{ id: 'code', name: 'Code' },
			];
			internal.currentMode = 'ask';

			const updated = await adapter.setConfigOption('mode', 'code');

			expect(setSessionMode).toHaveBeenCalledWith({
				sessionId: 'session-1',
				modeId: 'code',
			});
			expect(updated[0]).toMatchObject({ id: 'mode', currentValue: 'code' });
			expect(adapter.getCurrentMode()).toBe('code');
		});

		it('notifies listeners when session state changes', () => {
			const listener = vi.fn();
			const unsubscribe = adapter.subscribeSessionState(listener);

			adapter.handlePlan([
				{ content: 'Verify ACP flow', priority: 'high', status: 'in_progress' },
			]);

			expect(listener).toHaveBeenCalledTimes(1);
			expect(adapter.getPlan()).toEqual([
				{ content: 'Verify ACP flow', priority: 'high', status: 'in_progress' },
			]);

			unsubscribe();
			adapter.handleCurrentModeUpdate('code');
			expect(listener).toHaveBeenCalledTimes(1);
		});
	});
});
