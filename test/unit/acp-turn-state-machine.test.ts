import { describe, expect, it, vi } from 'vitest';
import { AcpTurnStateMachine } from '../../src/acp/acp-turn-state-machine';

describe('AcpTurnStateMachine', () => {
	it('accepts turn-bound updates only while a turn is active', () => {
		const machine = new AcpTurnStateMachine();
		expect(machine.canAcceptTurnBoundUpdates()).toBe(false);

		const turnId = machine.startTurn();
		machine.markRunning(turnId);
		expect(machine.canAcceptTurnBoundUpdates()).toBe(true);

		machine.completeTurn(turnId);
		expect(machine.canAcceptTurnBoundUpdates()).toBe(false);
	});

	it('cancels pending permission requests during cancellation', () => {
		const machine = new AcpTurnStateMachine();
		const cancel = vi.fn();

		machine.registerPendingPermission(cancel);
		machine.beginCancellation();

		expect(cancel).toHaveBeenCalledTimes(1);
	});
});
