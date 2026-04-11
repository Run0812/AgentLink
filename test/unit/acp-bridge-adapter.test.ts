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
			expect(caps).not.toContain('terminal');
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

		it('waits for an in-flight prepareSession before sending the first prompt', async () => {
			const prompt = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
			const internal = adapter as unknown as {
				connection: { prompt: typeof prompt } | null;
				sessionId: string | null;
			};

			vi.spyOn(adapter as never, 'startBridgeProcess').mockImplementation(
				() => new Promise((resolve) => setTimeout(resolve, 10)),
			);
			vi.spyOn(adapter as never, 'createConnection').mockImplementation(async () => {
				internal.connection = { prompt } as never;
			});
			vi.spyOn(adapter as never, 'initializeProtocol').mockResolvedValue(undefined);
			vi.spyOn(adapter as never, 'createSession').mockImplementation(async () => {
				internal.sessionId = 'session-1';
			});

			const handlers = {
				onChunk: vi.fn(),
				onComplete: vi.fn(),
				onError: vi.fn(),
			};

			const warmup = adapter.prepareSession();
			await adapter.sendMessage({ prompt: 'hello' }, handlers);
			await warmup;

			expect(prompt).toHaveBeenCalledWith({
				sessionId: 'session-1',
				prompt: [{ type: 'text', text: 'hello' }],
			});
			expect(handlers.onComplete).toHaveBeenCalledWith('(No response)');
			expect(handlers.onError).not.toHaveBeenCalled();
		});

		it('resets ACP session state when starting a fresh chat', async () => {
			const newSession = vi.fn().mockResolvedValue({
				sessionId: 'session-2',
				modes: {
					currentModeId: 'ask',
					availableModes: [{ id: 'ask', name: 'Ask', description: 'Safe mode' }],
				},
			});

			const internal = adapter as unknown as {
				connection: { newSession: typeof newSession } | null;
				sessionId: string | null;
				state: 'connected';
				configOptions: unknown[];
				sessionModes: Array<{ id: string; name: string; description?: string }>;
				availableCommands: Array<{ name: string; description: string }>;
				plan: Array<{ content: string; priority: string; status: string }>;
				currentMode: string | null;
			};

			internal.connection = { newSession } as never;
			internal.sessionId = 'session-1';
			internal.state = 'connected';
			internal.configOptions = [{ id: 'mode' }];
			internal.sessionModes = [{ id: 'code', name: 'Code' }];
			internal.availableCommands = [{ name: 'old', description: 'Old command' }];
			internal.plan = [{ content: 'Old plan', priority: 'high', status: 'in_progress' }];
			internal.currentMode = 'code';

			await adapter.prepareSession({ reset: true });

			expect(newSession).toHaveBeenCalledTimes(1);
			expect(adapter.getAvailableCommands()).toEqual([]);
			expect(adapter.getPlan()).toEqual([]);
			expect(adapter.getCurrentMode()).toBe('ask');
			expect(adapter.getConfigOptions()).toEqual([
				{
					id: 'mode',
					name: 'Mode',
					description: 'Agent session mode',
					category: 'mode',
					type: 'select',
					currentValue: 'ask',
					options: [{ value: 'ask', name: 'Ask', description: 'Safe mode' }],
				},
			]);
		});

		it('returns the selected permission option from the UI callback', async () => {
			adapter.setCallbacks({
				onPermissionRequest: (_toolCall, options, resolve) => {
					resolve({ approved: true, optionId: options[1]?.optionId });
				},
			});

			const response = await adapter.handlePermissionRequest({
				sessionId: 'session-1',
				toolCall: {
					toolCallId: 'call-1',
					toolName: 'write_file',
					title: 'Write review.md',
					arguments: JSON.stringify({ path: 'review.md' }),
				},
				options: [
					{ optionId: 'deny', name: 'Deny', kind: 'reject' },
					{ optionId: 'allow', name: 'Allow', kind: 'allow_once' },
				],
			} as never);

			expect(response).toEqual({
				outcome: {
					outcome: 'selected',
					optionId: 'allow',
				},
			});
		});

		it('cancels permission requests when the UI rejects them', async () => {
			adapter.setCallbacks({
				onPermissionRequest: (_toolCall, _options, resolve) => {
					resolve({ approved: false });
				},
			});

			const response = await adapter.handlePermissionRequest({
				sessionId: 'session-1',
				toolCall: {
					toolCallId: 'call-2',
					toolName: 'write_file',
					title: 'Write review.md',
				},
				options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
			} as never);

			expect(response).toEqual({
				outcome: {
					outcome: 'cancelled',
				},
			});
		});

		it('stores ACP context usage when the agent reports used and max tokens', () => {
			adapter.handleContextUsageUpdate({
				used: 2700,
				size: 272000,
				sections: [
					{
						title: 'System',
						items: [
							{ label: 'System Instructions', usedTokens: 1600 },
							{ label: 'Tool Definitions', usedTokens: 1100 },
						],
					},
				],
			});

			expect(adapter.getContextUsage()).toEqual({
				usedTokens: 2700,
				maxTokens: 272000,
				percentage: 1,
				source: 'acp',
				summary: undefined,
				sections: [
					{
						title: 'System',
						items: [
							{ label: 'System Instructions', usedTokens: 1600 },
							{ label: 'Tool Definitions', usedTokens: 1100 },
						],
					},
				],
				lastUpdatedAt: expect.any(Number),
			});
		});

		it('detects ACP authentication-required errors', () => {
			const internal = adapter as unknown as {
				isAuthenticationRequiredError: (error: unknown) => boolean;
			};

			expect(internal.isAuthenticationRequiredError({ code: -32000 })).toBe(true);
			expect(internal.isAuthenticationRequiredError({ error: { code: -32000 } })).toBe(true);
			expect(internal.isAuthenticationRequiredError(new Error('Authentication required before session/new'))).toBe(true);
			expect(internal.isAuthenticationRequiredError(new Error('Other failure'))).toBe(false);
		});

		it('authenticates and retries session creation when session/new requires auth', async () => {
			const newSession = vi.fn()
				.mockRejectedValueOnce({ code: -32000, message: 'auth_required' })
				.mockResolvedValueOnce({
					sessionId: 'session-2',
					modes: {
						currentModeId: 'code',
						availableModes: [{ id: 'code', name: 'Code' }],
					},
				});
			const authenticate = vi.fn().mockResolvedValue({});

			const internal = adapter as unknown as {
				connection: { newSession: typeof newSession; authenticate: typeof authenticate };
				authMethods: Array<{ id: string; name: string }>;
				createSession: () => Promise<void>;
				sessionId: string | null;
			};
			internal.connection = { newSession, authenticate } as never;
			internal.authMethods = [{ id: 'agent-login', name: 'Agent login' }];

			await internal.createSession();

			expect(authenticate).toHaveBeenCalledWith({ methodId: 'agent-login' });
			expect(newSession).toHaveBeenCalledTimes(2);
			expect(internal.sessionId).toBe('session-2');
			expect(adapter.getCurrentMode()).toBe('code');
		});

		it('fails clearly when only unsupported auth methods are available', async () => {
			const internal = adapter as unknown as {
				authMethods: Array<{ id: string; name: string; type: string }>;
				requestAuthenticationMethodSelection: () => Promise<unknown>;
			};
			internal.authMethods = [
				{ id: 'env-auth', name: 'Environment auth', type: 'env_var' },
			];

			await expect(internal.requestAuthenticationMethodSelection()).rejects.toThrow(
				'unsupported authentication methods',
			);
		});
	});
});
