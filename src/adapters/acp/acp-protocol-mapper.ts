import { AvailableCommand, ConfigOption, ConfigOptionCategory, ConfigOptionValue, ContextUsageState, SessionModeOption } from '../../core/types';

export class AcpProtocolMapper {
	mapAvailableCommandInput(input: unknown): AvailableCommand['input'] {
		if (!input || typeof input !== 'object') {
			return null;
		}

		const record = input as Record<string, unknown>;
		if (typeof record.hint === 'string') {
			return { hint: record.hint };
		}

		return null;
	}

	mapSessionModes(modes: unknown): SessionModeOption[] {
		if (!Array.isArray(modes)) {
			return [];
		}

		return modes
			.filter((mode): mode is { id: string; name: string; description?: string | null } =>
				Boolean(mode && typeof mode === 'object' && 'id' in mode && 'name' in mode),
			)
			.map((mode) => ({
				id: mode.id,
				name: mode.name,
				description: mode.description ?? undefined,
			}));
	}

	mapConfigOptions(configOptions: unknown): ConfigOption[] {
		if (!Array.isArray(configOptions)) {
			return [];
		}

		const mappedOptions: ConfigOption[] = [];

		for (const option of configOptions) {
			if (!option || typeof option !== 'object') {
				continue;
			}

			const opt = option as {
				id?: string;
				name?: string;
				description?: string;
				category?: string;
				type?: string;
				currentValue?: string | boolean;
				options?: Array<
					{ value?: string; name?: string; description?: string } |
					{ group?: string; name?: string; options?: Array<{ value?: string; name?: string; description?: string }> }
				>;
			};

			if (!opt.id || !opt.name) {
				continue;
			}

			if (opt.type === 'boolean' && typeof opt.currentValue === 'boolean') {
				mappedOptions.push({
					id: opt.id,
					name: opt.name,
					description: opt.description ?? undefined,
					category: this.mapConfigOptionCategory(opt.category),
					type: 'boolean',
					currentValue: opt.currentValue,
				});
				continue;
			}

			if (opt.type !== 'select' || !Array.isArray(opt.options)) {
				continue;
			}

			const values = this.flattenConfigOptionValues(opt.options);
			if (values.length === 0) {
				continue;
			}

			mappedOptions.push({
				id: opt.id,
				name: opt.name,
				description: opt.description ?? undefined,
				category: this.mapConfigOptionCategory(opt.category),
				type: 'select',
				currentValue: typeof opt.currentValue === 'string' ? opt.currentValue : '',
				options: values,
			});
		}

		return mappedOptions;
	}

	describeConfigOptions(configOptions: ConfigOption[]): string {
		return configOptions.map((option) => `${option.id}=${String(option.currentValue)}`).join(', ') || '(none)';
	}

	parseContextUsage(input: unknown, currentUsage?: ContextUsageState | null): ContextUsageState | null {
		if (!input || typeof input !== 'object') {
			return null;
		}

		const record = input as Record<string, unknown>;
		const usageRecord = this.asRecord(record.usage) ?? record;
		const usedTokens = this.readNumberField(usageRecord, ['used', 'usedTokens', 'totalTokens', 'total_tokens']);
		const maxTokens =
			this.readNumberField(usageRecord, ['size', 'maxTokens', 'max_tokens', 'limit']) ??
			this.readNestedNumberField(usageRecord, 'contextWindow', ['size', 'maxTokens', 'limit']);

		if (usedTokens === null && maxTokens === null) {
			return null;
		}

		const sections = this.parseUsageSections(usageRecord);
		return {
			usedTokens: usedTokens ?? currentUsage?.usedTokens ?? 0,
			maxTokens: maxTokens ?? undefined,
			percentage:
				usedTokens !== null && maxTokens && maxTokens > 0
					? Math.max(0, Math.min(100, Math.round((usedTokens / maxTokens) * 100)))
					: undefined,
			source: 'acp',
			summary: typeof usageRecord.summary === 'string' ? usageRecord.summary : undefined,
			sections,
			lastUpdatedAt: Date.now(),
		};
	}

	private flattenConfigOptionValues(
		options: Array<
			{ value?: string; name?: string; description?: string } |
			{ group?: string; name?: string; options?: Array<{ value?: string; name?: string; description?: string }> }
		>,
	): ConfigOptionValue[] {
		const values: ConfigOptionValue[] = [];

		for (const option of options) {
			if (!option || typeof option !== 'object') {
				continue;
			}

			if ('value' in option && typeof option.value === 'string' && typeof option.name === 'string') {
				values.push({
					value: option.value,
					name: option.name,
					description: option.description ?? undefined,
				});
				continue;
			}

			if ('options' in option && Array.isArray(option.options)) {
				const groupName = typeof option.name === 'string' ? option.name : undefined;
				for (const nested of option.options) {
					if (!nested?.value || !nested?.name) {
						continue;
					}
					values.push({
						value: nested.value,
						name: groupName ? `${groupName} / ${nested.name}` : nested.name,
						description: nested.description ?? undefined,
					});
				}
			}
		}

		return values;
	}

	private mapConfigOptionCategory(category: unknown): ConfigOptionCategory | undefined {
		if (category === 'mode' || category === 'model' || category === 'thought_level') {
			return category;
		}

		if (typeof category === 'string' && category.startsWith('_')) {
			return category as ConfigOptionCategory;
		}

		return undefined;
	}

	private parseUsageSections(record: Record<string, unknown>): ContextUsageState['sections'] {
		const rawSections = Array.isArray(record.sections)
			? record.sections
			: Array.isArray(record.breakdown)
				? record.breakdown
				: null;

		if (!rawSections) {
			return undefined;
		}

		const sections = rawSections
			.map((section) => {
				const sectionRecord = this.asRecord(section);
				if (!sectionRecord || typeof sectionRecord.title !== 'string' || !Array.isArray(sectionRecord.items)) {
					return null;
				}

				const items = sectionRecord.items
					.map((item) => {
						const itemRecord = this.asRecord(item);
						if (!itemRecord || typeof itemRecord.label !== 'string') {
							return null;
						}

						const used = this.readNumberField(itemRecord, ['usedTokens', 'used', 'tokens']);
						if (used === null) {
							return null;
						}

						return {
							label: itemRecord.label,
							usedTokens: used,
						};
					})
					.filter((item): item is NonNullable<typeof item> => Boolean(item));

				if (items.length === 0) {
					return null;
				}

				return {
					title: sectionRecord.title,
					items,
				};
			})
			.filter((section): section is NonNullable<typeof section> => Boolean(section));

		return sections.length > 0 ? sections : undefined;
	}

	private asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	}

	private readNumberField(record: Record<string, unknown>, keys: string[]): number | null {
		for (const key of keys) {
			const value = record[key];
			if (typeof value === 'number' && Number.isFinite(value)) {
				return value;
			}
		}

		return null;
	}

	private readNestedNumberField(record: Record<string, unknown>, key: string, nestedKeys: string[]): number | null {
		const nested = this.asRecord(record[key]);
		if (!nested) {
			return null;
		}

		return this.readNumberField(nested, nestedKeys);
	}
}
