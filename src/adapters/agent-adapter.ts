/**
 * Re-export the AgentAdapter interface and related types for convenient imports.
 *
 * ```ts
 * import type { AgentAdapter, AgentInput, StreamHandlers, AgentStatus } from '../adapters/agent-adapter';
 * ```
 */
export type {
	AgentAdapter,
	AgentInput,
	StreamHandlers,
	AgentStatus,
	AgentStatusState,
	AgentCapability,
	AgentResponse,
	AgentResponseType,
	AgentTextResponse,
	AgentThinkingResponse,
	AgentToolCallResponse,
	AgentFileEditResponse,
	AgentErrorResponse,
	ToolCall,
	ToolResult,
	ToolType,
	ToolPermission,
	ToolDefinition,
	AgentSession,
	// Backend config types
	BackendType,
	AgentBackendConfig,
	AcpBridgeBackendConfig,
	BackendSummary,
	// Skill types
	Skill,
	SkillParameter,
} from '../core/types';

export {
	ALL_CAPABILITIES,
	CAPABILITY_LABELS,
	TOOL_METADATA,
	BUILTIN_COMMANDS,
	generateToolCallId,
} from '../core/types';
