/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

export const COMMODITY_TARIFF_CLUSTER_ID = 1792;

const BLOCK_MODE_NAMES: Record<number, string> = {
    0: "No usage blocks",
    1: "Combined usage blocks",
    2: "Individual usage blocks",
};

/** Matter 1.6 §9.12.5.6: what a tariff component's Threshold field(s) actually meter. */
const BLOCK_MODE_DESCRIPTIONS: Record<number, string> = {
    0: "This tariff has no usage-based price tiers.",
    1: "Price tiers apply to total usage combined across all tariff components during the billing period.",
    2: "Price tiers apply separately to usage during each tariff component's own active period.",
};
const DAY_TYPE_NAMES: Record<number, string> = { 0: "Standard", 1: "Holiday", 2: "Dynamic", 3: "Event" };
const TARIFF_PRICE_TYPE_NAMES: Record<number, string> = {
    0: "Standard",
    1: "Critical Peak",
    2: "Virtual Power Plant",
    3: "Incentive",
    4: "Incentive Signal",
};
const TARIFF_UNIT_NAMES: Record<number, string> = { 0: "kWh", 1: "kVAh" };

/** ISO 4217 numeric currency codes; falls back to the raw code when not listed here. */
const CURRENCY_SYMBOLS: Record<number, string> = { 978: "€", 840: "$", 826: "£", 756: "CHF" };

/** Matter epoch-s values count seconds since 2000-01-01T00:00:00Z, not the Unix epoch. */
const MATTER_EPOCH_OFFSET_SECONDS = 946_684_800;

/** CommodityTariff FeatureMap bits per Matter 1.6 §9.12.4. */
const FEATURE_BITS = {
    pricing: 0b1,
    friendlyCredit: 0b10,
    auxiliaryLoad: 0b100,
    peakPeriod: 0b1000,
    powerThreshold: 0b10000,
    randomization: 0b100000,
} as const;

export interface CurrencyInfo {
    code: number;
    decimalPoints: number;
    symbol?: string;
}

export interface TariffInfo {
    label?: string;
    providerName?: string;
    currency?: CurrencyInfo;
    blockMode?: string;
    blockModeDescription?: string;
}

export interface TariffPriceInfo {
    priceType: string;
    amount?: string;
    priceLevel?: number;
}

export interface TariffComponentInfo {
    id: number;
    label?: string;
    price?: TariffPriceInfo;
    threshold?: number;
}

export interface DayEntryInfo {
    id: number;
    startMinutes: number;
    durationMinutes?: number;
}

export interface TariffPeriodInfo {
    label?: string;
    dayEntryIds: number[];
    tariffComponentIds: number[];
}

export interface DayInfo {
    date?: number;
    dayType?: string;
    dayEntryIds: number[];
}

export interface ScheduleRow {
    entryId: number;
    startMinutes: number;
    endMinutes: number;
    label?: string;
    price?: TariffPriceInfo;
}

export interface TariffRange {
    /** Epoch seconds the range starts at. */
    start: number;
    /** Epoch seconds the range ends at, when known. */
    end?: number;
}

export interface CommodityTariffFeatures {
    pricing: boolean;
    friendlyCredit: boolean;
    auxiliaryLoad: boolean;
    peakPeriod: boolean;
    powerThreshold: boolean;
    randomization: boolean;
}

export interface CommodityTariffInfo {
    supported: boolean;
    features: CommodityTariffFeatures;
    tariffInfo?: TariffInfo;
    tariffUnit?: string;
    startDate?: number;
    currentComponent?: TariffComponentInfo;
    nextComponent?: TariffComponentInfo;
    currentRange?: TariffRange;
    nextRange?: TariffRange;
    todaySchedule: ScheduleRow[];
    tomorrowSchedule: ScheduleRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Wire-format structs are field-tag keyed (e.g. `{"0": ..., "1": ...}`), not camelCase field names. */
function field(value: unknown, tag: number): unknown {
    return isRecord(value) ? value[String(tag)] : undefined;
}

function attr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): unknown {
    return attributes[`${endpoint}/${COMMODITY_TARIFF_CLUSTER_ID}/${attributeId}`];
}

function numberOrUndefined(value: unknown): number | undefined {
    return typeof value === "number" || typeof value === "bigint" ? Number(value) : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function numberList(value: unknown): number[] {
    return Array.isArray(value)
        ? value
              .map(v => (typeof v === "number" || typeof v === "bigint" ? Number(v) : NaN))
              .filter((v): v is number => Number.isFinite(v))
        : [];
}

function decodeCurrency(value: unknown): CurrencyInfo | undefined {
    const code = field(value, 0);
    const decimalPoints = field(value, 1);
    if (typeof code !== "number" || typeof decimalPoints !== "number") return undefined;
    return { code, decimalPoints, symbol: CURRENCY_SYMBOLS[code] };
}

/** Formats a raw tariff price integer using the currency's decimal point scale (e.g. 1579 @ 4dp -> "0.1579 €"). */
export function formatPrice(price: unknown, currency: CurrencyInfo | undefined): string | undefined {
    const raw = numberOrUndefined(price);
    if (raw === undefined) return undefined;
    const decimalPoints = currency?.decimalPoints ?? 0;
    const amount = (raw / 10 ** decimalPoints).toFixed(decimalPoints);
    if (!currency) return amount;
    return currency.symbol ? `${amount} ${currency.symbol}` : `${amount} (ISO 4217 #${currency.code})`;
}

function decodeTariffInfo(value: unknown): TariffInfo | undefined {
    if (!isRecord(value)) return undefined;
    const blockMode = field(value, 3);
    return {
        label: stringOrUndefined(field(value, 0)),
        providerName: stringOrUndefined(field(value, 1)),
        currency: decodeCurrency(field(value, 2)),
        blockMode:
            typeof blockMode === "number" ? (BLOCK_MODE_NAMES[blockMode] ?? `Unknown (${blockMode})`) : undefined,
        blockModeDescription: typeof blockMode === "number" ? BLOCK_MODE_DESCRIPTIONS[blockMode] : undefined,
    };
}

function decodeTariffPrice(value: unknown, currency: CurrencyInfo | undefined): TariffPriceInfo | undefined {
    if (!isRecord(value)) return undefined;
    const priceType = field(value, 0);
    return {
        priceType:
            typeof priceType === "number"
                ? (TARIFF_PRICE_TYPE_NAMES[priceType] ?? `Unknown (${priceType})`)
                : "Unknown",
        amount: formatPrice(field(value, 1), currency),
        priceLevel: numberOrUndefined(field(value, 2)),
    };
}

function decodeTariffComponent(value: unknown, currency: CurrencyInfo | undefined): TariffComponentInfo | undefined {
    if (!isRecord(value)) return undefined;
    const id = field(value, 0);
    if (typeof id !== "number") return undefined;
    return {
        id,
        label: stringOrUndefined(field(value, 7)),
        price: decodeTariffPrice(field(value, 1), currency),
        threshold: numberOrUndefined(field(value, 6)),
    };
}

function decodeTariffComponents(value: unknown, currency: CurrencyInfo | undefined): TariffComponentInfo[] {
    return Array.isArray(value)
        ? value
              .map(entry => decodeTariffComponent(entry, currency))
              .filter((c): c is TariffComponentInfo => c !== undefined)
        : [];
}

function decodeDayEntry(value: unknown): DayEntryInfo | undefined {
    const id = field(value, 0);
    const startTime = field(value, 1);
    if (typeof id !== "number" || typeof startTime !== "number") return undefined;
    return { id, startMinutes: startTime, durationMinutes: numberOrUndefined(field(value, 2)) };
}

function decodeDayEntries(value: unknown): DayEntryInfo[] {
    return Array.isArray(value) ? value.map(decodeDayEntry).filter((e): e is DayEntryInfo => e !== undefined) : [];
}

function decodeTariffPeriod(value: unknown): TariffPeriodInfo | undefined {
    if (!isRecord(value)) return undefined;
    return {
        label: stringOrUndefined(field(value, 0)),
        dayEntryIds: numberList(field(value, 1)),
        tariffComponentIds: numberList(field(value, 2)),
    };
}

function decodeTariffPeriods(value: unknown): TariffPeriodInfo[] {
    return Array.isArray(value)
        ? value.map(decodeTariffPeriod).filter((p): p is TariffPeriodInfo => p !== undefined)
        : [];
}

function decodeDay(value: unknown): DayInfo | undefined {
    if (!isRecord(value)) return undefined;
    const dayType = field(value, 1);
    return {
        date: numberOrUndefined(field(value, 0)),
        dayType: typeof dayType === "number" ? (DAY_TYPE_NAMES[dayType] ?? `Unknown (${dayType})`) : undefined,
        dayEntryIds: numberList(field(value, 2)),
    };
}

/** CommodityTariff FeatureMap is a raw bitmap integer on the wire, not a named-boolean object. */
function decodeFeatures(value: unknown): CommodityTariffFeatures {
    const bits = typeof value === "number" ? value : 0;
    return {
        pricing: (bits & FEATURE_BITS.pricing) !== 0,
        friendlyCredit: (bits & FEATURE_BITS.friendlyCredit) !== 0,
        auxiliaryLoad: (bits & FEATURE_BITS.auxiliaryLoad) !== 0,
        peakPeriod: (bits & FEATURE_BITS.peakPeriod) !== 0,
        powerThreshold: (bits & FEATURE_BITS.powerThreshold) !== 0,
        randomization: (bits & FEATURE_BITS.randomization) !== 0,
    };
}

/** Resolves a day's entry ids into time-ordered rows, each showing the period label and price active during it. */
function buildDailySchedule(
    day: DayInfo | undefined,
    dayEntries: DayEntryInfo[],
    tariffPeriods: TariffPeriodInfo[],
    tariffComponents: TariffComponentInfo[],
): ScheduleRow[] {
    if (!day) return [];
    const entries = day.dayEntryIds
        .map(id => dayEntries.find(entry => entry.id === id))
        .filter((entry): entry is DayEntryInfo => entry !== undefined)
        .sort((a, b) => a.startMinutes - b.startMinutes);

    return entries.map((entry, index) => {
        const next = entries[index + 1];
        const endMinutes =
            entry.durationMinutes !== undefined
                ? Math.min(entry.startMinutes + entry.durationMinutes, 24 * 60)
                : next
                  ? next.startMinutes
                  : 24 * 60;
        const period = tariffPeriods.find(p => p.dayEntryIds.includes(entry.id));
        const component = tariffComponents.find(c => c.id === period?.tariffComponentIds[0]);
        return {
            entryId: entry.id,
            startMinutes: entry.startMinutes,
            endMinutes,
            label: period?.label ?? component?.label,
            price: component?.price,
        };
    });
}

function resolveEntryPeriod(
    entryId: number,
    tariffPeriods: TariffPeriodInfo[],
    tariffComponents: TariffComponentInfo[],
): { label?: string; componentId?: number } {
    const period = tariffPeriods.find(p => p.dayEntryIds.includes(entryId));
    const componentId = period?.tariffComponentIds[0];
    return { label: period?.label ?? tariffComponents.find(c => c.id === componentId)?.label, componentId };
}

/**
 * A period active at day-end and resumed at day-start (e.g. an off-peak block spanning midnight) is
 * modeled as two separate DayEntry records because DayEntry.startTime can't cross midnight. Finds when
 * `fromEntryId`'s period actually ends by walking the daily entry cycle forward (wrapping past midnight)
 * until the resolved period changes; returns the offset in minutes from `fromEntryId`'s own start, or
 * undefined if the cycle never changes period (e.g. a single entry, or all entries share one period).
 */
function minutesUntilNextTransition(
    fromEntryId: number,
    dayEntries: DayEntryInfo[],
    tariffPeriods: TariffPeriodInfo[],
    tariffComponents: TariffComponentInfo[],
): number | undefined {
    if (dayEntries.length < 2) return undefined;
    const sorted = [...dayEntries].sort((a, b) => a.startMinutes - b.startMinutes);
    const fromIndex = sorted.findIndex(entry => entry.id === fromEntryId);
    if (fromIndex === -1) return undefined;
    const fromPeriod = resolveEntryPeriod(fromEntryId, tariffPeriods, tariffComponents);

    for (let step = 1; step <= sorted.length; step++) {
        const position = fromIndex + step;
        const entry = sorted[position % sorted.length];
        const period = resolveEntryPeriod(entry.id, tariffPeriods, tariffComponents);
        if (period.label !== fromPeriod.label || period.componentId !== fromPeriod.componentId) {
            const wraps = Math.floor(position / sorted.length);
            return entry.startMinutes + wraps * 24 * 60 - sorted[fromIndex].startMinutes;
        }
    }
    return undefined;
}

/** Formats minutes-since-midnight as "HH:MM"; 1440 (end of day) renders as "24:00". */
export function formatMinutesOfDay(minutes: number): string {
    if (minutes >= 24 * 60) return "24:00";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Formats a Matter epoch-s instant as a local time, prefixed with the date when it isn't today. */
export function formatEpochTime(matterEpochSeconds: number, relativeTo: Date = new Date()): string {
    const date = new Date((matterEpochSeconds + MATTER_EPOCH_OFFSET_SECONDS) * 1000);
    const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === relativeTo.toDateString()) return time;
    const tomorrow = new Date(relativeTo);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
    return `${date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })} ${time}`;
}

export function commodityTariffInfo(attributes: Record<string, unknown>, endpoint: number): CommodityTariffInfo {
    const featureMap = attr(attributes, endpoint, 65532);
    const tariffInfo = decodeTariffInfo(attr(attributes, endpoint, 0));
    const currency = tariffInfo?.currency;
    const tariffUnitRaw = attr(attributes, endpoint, 1);
    const dayEntries = decodeDayEntries(attr(attributes, endpoint, 3));
    const tariffPeriods = decodeTariffPeriods(attr(attributes, endpoint, 14));
    const tariffComponents = decodeTariffComponents(attr(attributes, endpoint, 13), currency);
    const currentComponents = decodeTariffComponents(attr(attributes, endpoint, 15), currency);
    const nextComponents = decodeTariffComponents(attr(attributes, endpoint, 16), currency);
    const currentDayEntryDate = numberOrUndefined(attr(attributes, endpoint, 10));
    const nextDayEntryDate = numberOrUndefined(attr(attributes, endpoint, 12));
    const nextDayEntry = decodeDayEntry(attr(attributes, endpoint, 11));
    const nextEndOffsetMinutes =
        nextDayEntry !== undefined
            ? minutesUntilNextTransition(nextDayEntry.id, dayEntries, tariffPeriods, tariffComponents)
            : undefined;

    return {
        supported: featureMap !== undefined,
        features: decodeFeatures(featureMap),
        tariffInfo,
        tariffUnit:
            typeof tariffUnitRaw === "number"
                ? (TARIFF_UNIT_NAMES[tariffUnitRaw] ?? `Unknown (${tariffUnitRaw})`)
                : undefined,
        startDate: numberOrUndefined(attr(attributes, endpoint, 2)),
        currentComponent: currentComponents[0],
        nextComponent: nextComponents[0],
        currentRange:
            currentDayEntryDate !== undefined ? { start: currentDayEntryDate, end: nextDayEntryDate } : undefined,
        nextRange:
            nextDayEntryDate !== undefined
                ? {
                      start: nextDayEntryDate,
                      end:
                          nextEndOffsetMinutes !== undefined ? nextDayEntryDate + nextEndOffsetMinutes * 60 : undefined,
                  }
                : undefined,
        todaySchedule: buildDailySchedule(
            decodeDay(attr(attributes, endpoint, 7)),
            dayEntries,
            tariffPeriods,
            tariffComponents,
        ),
        tomorrowSchedule: buildDailySchedule(
            decodeDay(attr(attributes, endpoint, 8)),
            dayEntries,
            tariffPeriods,
            tariffComponents,
        ),
    };
}
