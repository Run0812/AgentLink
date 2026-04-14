export type CompatibilityProfile = {
	id: string;
	quirks: {
		lacksTurnComplete?: boolean;
		toolCallOrderUnstable?: boolean;
		weakCapabilityDeclaration?: boolean;
	};
};

export const DEFAULT_COMPATIBILITY_PROFILE: CompatibilityProfile = {
	id: 'default',
	quirks: {},
};
