import type { AvailableCommand, PlanEntry } from '../core/types';
import {
	permissionToolCallSchema,
	sessionAvailableCommandsSchema,
	sessionConfigOptionSchema,
	sessionCurrentModeSchema,
	sessionMessageChunkSchema,
	sessionPlanSchema,
	sessionToolCallSchema,
	sessionToolCallUpdateSchema,
	sessionUsageSchema,
} from './acp-event-schemas';

export type NormalizedAcpEvent =
	| { kind: 'message_chunk'; text: string }
	| { kind: 'thinking_chunk'; text: string }
	| { kind: 'tool_call'; toolCallId: string; tool: string; title: string; status: string; params: Record<string, unknown> }
	| { kind: 'tool_call_update'; toolCallId: string; status: string; texts: string[] }
	| { kind: 'plan'; entries: PlanEntry[] }
	| { kind: 'available_commands'; commands: Array<{ name: string; description: string; input?: unknown | null }> }
	| { kind: 'current_mode'; modeId: string | null }
	| { kind: 'config_options'; configOptions: unknown }
	| { kind: 'usage'; raw: unknown };

export type NormalizedPermissionToolCall = {
	id: string;
	tool: string;
	params: Record<string, unknown>;
	title: string;
};

function normalizeParams(rawParams: unknown): Record<string, unknown> {
	if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
		return rawParams as Record<string, unknown>;
	}

	if (typeof rawParams === 'string') {
		try {
			const parsed = JSON.parse(rawParams);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return { raw: rawParams };
		}
	}

	return {};
}

export function normalizeSessionUpdate(update: unknown): NormalizedAcpEvent | null {
	const messageChunk = sessionMessageChunkSchema.safeParse(update);
	if (messageChunk.success) {
		return {
			kind: messageChunk.data.sessionUpdate === 'agent_thought_chunk' ? 'thinking_chunk' : 'message_chunk',
			text: messageChunk.data.content.text,
		};
	}

	const toolCall = sessionToolCallSchema.safeParse(update);
	if (toolCall.success) {
		return {
			kind: 'tool_call',
			toolCallId: toolCall.data.toolCallId ?? 'unknown-tool-call',
			tool: toolCall.data.toolName ?? toolCall.data.tool ?? 'unknown',
			title: toolCall.data.title ?? toolCall.data.toolName ?? toolCall.data.tool ?? 'Tool call',
			status: toolCall.data.status ?? 'pending',
			params: normalizeParams(toolCall.data.arguments ?? toolCall.data.params),
		};
	}

	const toolCallUpdate = sessionToolCallUpdateSchema.safeParse(update);
	if (toolCallUpdate.success) {
		return {
			kind: 'tool_call_update',
			toolCallId: toolCallUpdate.data.toolCallId,
			status: toolCallUpdate.data.status ?? 'pending',
			texts: (toolCallUpdate.data.content ?? [])
				.map((item) => item.content?.text)
				.filter((text): text is string => typeof text === 'string'),
		};
	}

	const plan = sessionPlanSchema.safeParse(update);
	if (plan.success) {
		return { kind: 'plan', entries: plan.data.entries };
	}

	const availableCommands = sessionAvailableCommandsSchema.safeParse(update);
	if (availableCommands.success) {
		return {
			kind: 'available_commands',
			commands: availableCommands.data.availableCommands as AvailableCommand[],
		};
	}

	const currentMode = sessionCurrentModeSchema.safeParse(update);
	if (currentMode.success) {
		return { kind: 'current_mode', modeId: currentMode.data.currentModeId ?? null };
	}

	const configOption = sessionConfigOptionSchema.safeParse(update);
	if (configOption.success) {
		return { kind: 'config_options', configOptions: configOption.data.configOptions };
	}

	const usage = sessionUsageSchema.safeParse(update);
	if (usage.success) {
		return { kind: 'usage', raw: update };
	}

	return null;
}

export function normalizePermissionToolCall(toolCall: unknown): NormalizedPermissionToolCall {
	const parsed = permissionToolCallSchema.safeParse(toolCall);
	if (!parsed.success) {
		return {
			id: 'permission-request',
			tool: 'unknown',
			params: {},
			title: 'Permission request',
		};
	}

	const data = parsed.data;
	return {
		id: data.toolCallId ?? data.id ?? 'permission-request',
		tool: data.toolName ?? data.tool ?? 'unknown',
		params: normalizeParams(data.arguments ?? data.params),
		title: data.title ?? data.toolName ?? data.tool ?? 'Permission request',
	};
}
