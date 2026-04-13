import { AvailableCommand, ConfigOption, ContextUsageState, PlanEntry, SessionModeOption } from '../../core/types';

export class AcpSessionState {
	sessionId: string | null = null;
	configOptions: ConfigOption[] = [];
	sessionModes: SessionModeOption[] = [];
	availableCommands: AvailableCommand[] = [];
	plan: PlanEntry[] = [];
	currentMode: string | null = null;
	contextUsage: ContextUsageState | null = null;

	reset(): void {
		this.sessionId = null;
		this.configOptions = [];
		this.sessionModes = [];
		this.availableCommands = [];
		this.plan = [];
		this.currentMode = null;
		this.contextUsage = null;
	}
}
