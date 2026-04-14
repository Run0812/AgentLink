export type TurnState =
	| { kind: 'idle' }
	| { kind: 'starting'; turnId: string }
	| { kind: 'running'; turnId: string }
	| { kind: 'awaiting_tool'; turnId: string; toolName: string }
	| { kind: 'cancelling'; turnId: string }
	| { kind: 'completed'; turnId: string }
	| { kind: 'failed'; turnId: string; message: string };

export class AcpTurnStateMachine {
	private sequence = 0;
	private state: TurnState = { kind: 'idle' };
	private readonly pendingToolCalls = new Set<string>();
	private readonly pendingPermissionCancels = new Set<() => void>();

	startTurn(): string {
		const turnId = `turn_${++this.sequence}`;
		this.pendingToolCalls.clear();
		this.state = { kind: 'starting', turnId };
		return turnId;
	}

	markRunning(turnId: string): void {
		if (this.matchesTurn(turnId)) {
			this.state = { kind: 'running', turnId };
		}
	}

	registerToolCall(turnId: string, toolCallId: string, toolName: string): void {
		if (!this.matchesTurn(turnId)) {
			return;
		}

		this.pendingToolCalls.add(toolCallId);
		this.state = { kind: 'awaiting_tool', turnId, toolName };
	}

	updateToolCall(turnId: string, toolCallId: string, status: string): void {
		if (!this.matchesTurn(turnId)) {
			return;
		}

		if (status === 'completed' || status === 'failed' || status === 'cancelled') {
			this.pendingToolCalls.delete(toolCallId);
		}

		if (this.pendingToolCalls.size === 0) {
			this.state = { kind: 'running', turnId };
		}
	}

	beginCancellation(): string | null {
		const turnId = 'turnId' in this.state ? this.state.turnId : null;
		if (turnId) {
			this.state = { kind: 'cancelling', turnId };
		}
		this.cancelPendingPermissions();
		this.pendingToolCalls.clear();
		return turnId;
	}

	completeTurn(turnId: string): void {
		if (!this.matchesTurn(turnId)) {
			return;
		}

		this.pendingToolCalls.clear();
		this.cancelPendingPermissions();
		this.state = { kind: 'completed', turnId };
	}

	failTurn(turnId: string, message: string): void {
		if (!this.matchesTurn(turnId)) {
			return;
		}

		this.pendingToolCalls.clear();
		this.cancelPendingPermissions();
		this.state = { kind: 'failed', turnId, message };
	}

	reset(): void {
		this.pendingToolCalls.clear();
		this.cancelPendingPermissions();
		this.state = { kind: 'idle' };
	}

	registerPendingPermission(cancel: () => void): () => void {
		this.pendingPermissionCancels.add(cancel);
		return () => {
			this.pendingPermissionCancels.delete(cancel);
		};
	}

	cancelPendingPermissions(): void {
		for (const cancel of this.pendingPermissionCancels) {
			cancel();
		}
		this.pendingPermissionCancels.clear();
	}

	canAcceptTurnBoundUpdates(): boolean {
		return this.state.kind === 'starting'
			|| this.state.kind === 'running'
			|| this.state.kind === 'awaiting_tool'
			|| this.state.kind === 'cancelling';
	}

	getState(): TurnState {
		return this.state;
	}

	private matchesTurn(turnId: string): boolean {
		return 'turnId' in this.state && this.state.turnId === turnId;
	}
}
