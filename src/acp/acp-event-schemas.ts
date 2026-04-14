import { z } from 'zod';

const textContentSchema = z.object({
	type: z.literal('text'),
	text: z.string(),
}).passthrough();

const toolCallParamsSchema = z.union([
	z.string(),
	z.record(z.string(), z.unknown()),
]);

export const sessionMessageChunkSchema = z.object({
	sessionUpdate: z.union([z.literal('agent_message_chunk'), z.literal('agent_thought_chunk')]),
	content: textContentSchema,
}).passthrough();

export const sessionToolCallSchema = z.object({
	sessionUpdate: z.literal('tool_call'),
	toolCallId: z.string().optional(),
	title: z.string().optional(),
	status: z.string().optional(),
	tool: z.string().optional(),
	toolName: z.string().optional(),
	arguments: toolCallParamsSchema.optional(),
	params: toolCallParamsSchema.optional(),
}).passthrough();

export const sessionToolCallUpdateSchema = z.object({
	sessionUpdate: z.literal('tool_call_update'),
	toolCallId: z.string(),
	status: z.string().optional(),
	content: z.array(
		z.object({
			type: z.literal('content'),
			content: textContentSchema.optional(),
		}).passthrough(),
	).optional(),
}).passthrough();

export const sessionPlanSchema = z.object({
	sessionUpdate: z.literal('plan'),
	entries: z.array(z.object({
		content: z.string(),
		priority: z.enum(['high', 'medium', 'low']),
		status: z.enum(['pending', 'in_progress', 'completed']),
	}).passthrough()).default([]),
}).passthrough();

export const availableCommandSchema = z.object({
	name: z.string(),
	description: z.string(),
	input: z.unknown().optional().nullable(),
}).passthrough();

export const sessionAvailableCommandsSchema = z.object({
	sessionUpdate: z.literal('available_commands_update'),
	availableCommands: z.array(availableCommandSchema).default([]),
}).passthrough();

export const sessionCurrentModeSchema = z.object({
	sessionUpdate: z.literal('current_mode_update'),
	currentModeId: z.string().nullable().optional(),
}).passthrough();

export const sessionConfigOptionSchema = z.object({
	sessionUpdate: z.literal('config_option_update'),
	configOptions: z.unknown().optional(),
}).passthrough();

export const sessionUsageSchema = z.object({
	sessionUpdate: z.literal('usage_update'),
}).passthrough();

export const permissionToolCallSchema = z.object({
	toolCallId: z.string().optional(),
	id: z.string().optional(),
	toolName: z.string().optional(),
	tool: z.string().optional(),
	title: z.string().optional(),
	arguments: toolCallParamsSchema.optional(),
	params: toolCallParamsSchema.optional(),
}).passthrough();
