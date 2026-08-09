/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterNode } from "@matter-server/ws-client";
import { asObject, pickNumber, pickString } from "./attribute-shapes.js";
import { computeActiveClusterFeatures } from "./cluster-features.js";
import {
    formatHandleShort,
    formatPresetLabel,
    isFeatureActive,
    THERMOSTAT_CLUSTER_ID,
    type ThermostatPreset,
} from "./thermostat-schedule.js";

const ATTR_MAX_SUGGESTIONS = 0x53;
const ATTR_SUGGESTIONS = 0x54;
const ATTR_CURRENT_SUGGESTION = 0x55;
const ATTR_NOT_FOLLOWING_REASON = 0x56;

export interface ThermostatSuggestion {
    uniqueId: number;
    presetHandle: string;
    effectiveTime: number;
    expirationTime: number;
}

/** ThermostatSuggestionNotFollowingReasonBitmap (Matter spec §4.3.9.14). */
const NOT_FOLLOWING_REASON_BITS = [
    { bit: 0, code: "DemandResponseEvent", label: "Demand Response Event" },
    { bit: 1, code: "OngoingHold", label: "Ongoing Hold" },
    { bit: 2, code: "Schedule", label: "Schedule" },
    { bit: 3, code: "Occupancy", label: "Occupancy" },
    { bit: 4, code: "VacationMode", label: "Vacation Mode" },
    { bit: 5, code: "TimeOfUseCostSavings", label: "Time-of-Use Cost Savings" },
    { bit: 6, code: "PreCoolingOrPreHeating", label: "Pre-cooling / Pre-heating" },
    { bit: 7, code: "ConflictingSuggestions", label: "Conflicting Suggestions" },
];

function readAttr(node: MatterNode, endpoint: number, attrId: number): unknown {
    return node.attributes[`${endpoint}/${THERMOSTAT_CLUSTER_ID}/${attrId}`];
}

// Struct attributes reach the dashboard field-tag keyed, matching ThermostatSuggestionStruct's field order.
function decodeSuggestion(raw: unknown): ThermostatSuggestion | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const uniqueId = pickNumber(obj, "0");
    const presetHandle = pickString(obj, "1");
    const effectiveTime = pickNumber(obj, "2");
    const expirationTime = pickNumber(obj, "3");
    if (uniqueId === null || presetHandle === null || effectiveTime === null || expirationTime === null) return null;
    return { uniqueId, presetHandle, effectiveTime, expirationTime };
}

/** Whether the Thermostat cluster's FeatureMap includes Thermostat Suggestions (TSUGGEST). */
export function isTSUGGESTActive(node: MatterNode, endpoint: number): boolean {
    return isFeatureActive(node, endpoint, "TSUGGEST");
}

export function readMaxThermostatSuggestions(node: MatterNode, endpoint: number): number | null {
    const v = readAttr(node, endpoint, ATTR_MAX_SUGGESTIONS);
    return typeof v === "number" ? v : null;
}

/** Decoded ThermostatSuggestions queue, or undefined when the attribute is not in the node's attribute cache. */
export function readThermostatSuggestions(node: MatterNode, endpoint: number): ThermostatSuggestion[] | undefined {
    const raw = readAttr(node, endpoint, ATTR_SUGGESTIONS);
    if (!Array.isArray(raw)) return undefined;
    return raw.map(decodeSuggestion).filter((s): s is ThermostatSuggestion => s !== null);
}

export function readCurrentThermostatSuggestion(node: MatterNode, endpoint: number): ThermostatSuggestion | null {
    return decodeSuggestion(readAttr(node, endpoint, ATTR_CURRENT_SUGGESTION));
}

/** Reasons the device isn't following CurrentThermostatSuggestion, decoded from the reason bitmap. */
export function readThermostatSuggestionNotFollowingReasons(
    node: MatterNode,
    endpoint: number,
): { bit: number; code: string; label: string }[] {
    const raw = readAttr(node, endpoint, ATTR_NOT_FOLLOWING_REASON);
    if (typeof raw !== "number") return [];
    return computeActiveClusterFeatures(raw, NOT_FOLLOWING_REASON_BITS);
}

/** A suggestion's display label: its referenced preset's name/scenario, else its handle. */
export function resolveSuggestionLabel(suggestion: ThermostatSuggestion, presets: ThermostatPreset[]): string {
    const preset = presets.find(p => p.handle === suggestion.presetHandle);
    return preset ? formatPresetLabel(preset) : formatHandleShort(suggestion.presetHandle);
}
