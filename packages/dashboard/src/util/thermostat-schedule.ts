/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterNode } from "@matter-server/ws-client";
import { clusters } from "../client/models/descriptions.js";
import { asObject } from "./attribute-shapes.js";
import { computeActiveClusterFeatures } from "./cluster-features.js";

/** Thermostat cluster (Matter spec §4.4). */
export const THERMOSTAT_CLUSTER_ID = 513; // 0x0201

const ATTR_PRESETS = 0x50;
const ATTR_SCHEDULES = 0x51;
const ATTR_ACTIVE_SCHEDULE_HANDLE = 0x4f;
const ATTR_FEATURE_MAP = 0xfffc;

/** Days in display order (Mon..Sun) mapped to their ScheduleDayOfWeekBitmap bit (Sunday=0 .. Saturday=6). */
const DAY_BIT = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SYSTEM_MODE_LABELS: Record<number, string> = {
    0: "Off",
    1: "Auto",
    3: "Cool",
    4: "Heat",
    5: "Emergency Heat",
    6: "Precooling",
    7: "Fan Only",
    8: "Dry",
    9: "Sleep",
};

export interface ThermostatScheduleTransition {
    dayOfWeek: number;
    transitionTimeMin: number;
    presetHandle: string | null;
    systemMode: number | null;
    coolingSetpoint: number | null;
    heatingSetpoint: number | null;
}

export interface ThermostatSchedule {
    handle: string | null;
    systemMode: number;
    name: string | null;
    presetHandle: string | null;
    transitions: ThermostatScheduleTransition[];
    builtIn: boolean | null;
}

export interface ThermostatPreset {
    handle: string;
    name: string | null;
}

export interface DaySegment {
    startMin: number;
    endMin: number;
    heatingSetpoint: number | null;
    coolingSetpoint: number | null;
    presetHandle: string | null;
    systemMode: number | null;
}

function readAttr(node: MatterNode, endpoint: number, attrId: number): unknown {
    return node.attributes[`${endpoint}/${THERMOSTAT_CLUSTER_ID}/${attrId}`];
}

function pickStr(obj: Record<string, unknown>, name: string, tag: string): string | null {
    const v = obj[name] ?? obj[tag];
    return typeof v === "string" ? v : null;
}

function pickNum(obj: Record<string, unknown>, name: string, tag: string): number | null {
    const v = obj[name] ?? obj[tag];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickBool(obj: Record<string, unknown>, name: string, tag: string): boolean | null {
    const v = obj[name] ?? obj[tag];
    return typeof v === "boolean" ? v : null;
}

function pickArr(obj: Record<string, unknown>, name: string, tag: string): unknown[] {
    const v = obj[name] ?? obj[tag];
    return Array.isArray(v) ? v : [];
}

function decodeTransition(raw: unknown): ThermostatScheduleTransition | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const dayOfWeek = pickNum(obj, "DayOfWeek", "0");
    const transitionTimeMin = pickNum(obj, "TransitionTime", "1");
    if (dayOfWeek === null || transitionTimeMin === null) return null;
    return {
        dayOfWeek,
        transitionTimeMin,
        presetHandle: pickStr(obj, "PresetHandle", "2"),
        systemMode: pickNum(obj, "SystemMode", "3"),
        coolingSetpoint: pickNum(obj, "CoolingSetpoint", "4"),
        heatingSetpoint: pickNum(obj, "HeatingSetpoint", "5"),
    };
}

function decodeSchedule(raw: unknown): ThermostatSchedule | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const systemMode = pickNum(obj, "SystemMode", "1");
    if (systemMode === null) return null;
    const transitions = pickArr(obj, "Transitions", "4")
        .map(decodeTransition)
        .filter((t): t is ThermostatScheduleTransition => t !== null);
    return {
        handle: pickStr(obj, "ScheduleHandle", "0"),
        systemMode,
        name: pickStr(obj, "Name", "2"),
        presetHandle: pickStr(obj, "PresetHandle", "3"),
        transitions,
        builtIn: pickBool(obj, "BuiltIn", "5"),
    };
}

function decodePreset(raw: unknown): ThermostatPreset | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const handle = pickStr(obj, "PresetHandle", "0");
    if (handle === null) return null;
    return { handle, name: pickStr(obj, "Name", "2") };
}

/** Whether the Thermostat cluster's FeatureMap includes MatterScheduleConfiguration (MSCH). */
export function isMSCHActive(node: MatterNode, endpoint: number): boolean {
    const knownFeatures = Object.values(clusters[THERMOSTAT_CLUSTER_ID]?.features ?? {});
    const featureMapValue = node.attributes[`${endpoint}/${THERMOSTAT_CLUSTER_ID}/${ATTR_FEATURE_MAP}`];
    if (featureMapValue === undefined) return false;
    return computeActiveClusterFeatures(featureMapValue, knownFeatures).some(feature => feature.code === "MSCH");
}

export function readActiveScheduleHandle(node: MatterNode, endpoint: number): string | null {
    const v = readAttr(node, endpoint, ATTR_ACTIVE_SCHEDULE_HANDLE);
    return typeof v === "string" ? v : null;
}

export function readSchedules(node: MatterNode, endpoint: number): ThermostatSchedule[] {
    const raw = readAttr(node, endpoint, ATTR_SCHEDULES);
    if (!Array.isArray(raw)) return [];
    return raw.map(decodeSchedule).filter((s): s is ThermostatSchedule => s !== null);
}

/** Best-effort: only meaningful when the Presets (PRES) feature is supported, but harmless to read regardless. */
export function readPresets(node: MatterNode, endpoint: number): ThermostatPreset[] {
    const raw = readAttr(node, endpoint, ATTR_PRESETS);
    if (!Array.isArray(raw)) return [];
    return raw.map(decodePreset).filter((p): p is ThermostatPreset => p !== null);
}

/** Resolves a transition's human label: matching preset name, else SystemMode, else a generic fallback. */
export function resolveTransitionLabel(transition: ThermostatScheduleTransition, presets: ThermostatPreset[]): string {
    if (transition.presetHandle) {
        const preset = presets.find(p => p.handle === transition.presetHandle);
        if (preset?.name) return preset.name;
    }
    if (transition.systemMode !== null) {
        return SYSTEM_MODE_LABELS[transition.systemMode] ?? `Mode ${transition.systemMode}`;
    }
    return "Setpoint";
}

/**
 * For each day (Mon..Sun), finds the first schedule whose DayOfWeek bitmap claims it.
 * A schedule "claims" a day if any of its transitions include that day.
 */
export function assignDaysToSchedules(schedules: ThermostatSchedule[]): (ThermostatSchedule | undefined)[] {
    return DAY_BIT.map(bit => schedules.find(s => s.transitions.some(t => (t.dayOfWeek & (1 << bit)) !== 0)));
}

/**
 * Builds the ordered, gap-free list of setpoint segments covering a full day (0-1440 min) for one schedule.
 * The period before the day's first transition carries the *last* transition's setpoint, since Matter
 * schedules apply until the next transition — including across the midnight boundary.
 */
export function buildDaySegments(schedule: ThermostatSchedule, day: number): DaySegment[] {
    const bit = DAY_BIT[day];
    const dayTransitions = schedule.transitions
        .filter(t => (t.dayOfWeek & (1 << bit)) !== 0)
        .sort((a, b) => a.transitionTimeMin - b.transitionTimeMin);
    if (dayTransitions.length === 0) return [];

    const segments: DaySegment[] = [];
    const last = dayTransitions[dayTransitions.length - 1];
    if (dayTransitions[0].transitionTimeMin > 0) {
        segments.push({
            startMin: 0,
            endMin: dayTransitions[0].transitionTimeMin,
            heatingSetpoint: last.heatingSetpoint,
            coolingSetpoint: last.coolingSetpoint,
            presetHandle: last.presetHandle,
            systemMode: last.systemMode,
        });
    }
    for (let i = 0; i < dayTransitions.length; i++) {
        const t = dayTransitions[i];
        segments.push({
            startMin: t.transitionTimeMin,
            endMin: i + 1 < dayTransitions.length ? dayTransitions[i + 1].transitionTimeMin : 1440,
            heatingSetpoint: t.heatingSetpoint,
            coolingSetpoint: t.coolingSetpoint,
            presetHandle: t.presetHandle,
            systemMode: t.systemMode,
        });
    }
    return segments;
}

/** Matter "temperature" values are int16 hundredths of a degree Celsius. */
export function formatSetpoint(centidegrees: number | undefined | null): string | undefined {
    if (centidegrees === undefined || centidegrees === null) return undefined;
    return `${(centidegrees / 100).toFixed(1)}°C`;
}

export function computeSetpointRange(schedule: ThermostatSchedule): { min: number; max: number } | undefined {
    const values = schedule.transitions
        .flatMap(t => [t.heatingSetpoint, t.coolingSetpoint])
        .filter((v): v is number => v !== null);
    if (values.length === 0) return undefined;
    return { min: Math.min(...values), max: Math.max(...values) };
}

/** Clamped 0-100 position of `value` within [min, max], for driving a cold->hot color-mix gradient. */
export function setpointColorMixPercent(value: number, min: number, max: number): number {
    if (max <= min) return 50;
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export type ScheduleColorMode = "heat" | "cool";

/**
 * The setpoint driving a segment's color for the given mode. In Auto mode (both heat and cool
 * present), averaging the two would flatten the gradient to a single muddy blend whenever the
 * band is centered on the same setpoint all day — showing one bound at a time (user-toggleable)
 * preserves the actual variation instead. Falls back to whichever setpoint is present when the
 * selected mode's isn't (e.g. a Cool-only schedule while in "heat" mode).
 */
export function pickSetpointForMode(seg: DaySegment, mode: ScheduleColorMode): number | null {
    return mode === "heat"
        ? (seg.heatingSetpoint ?? seg.coolingSetpoint)
        : (seg.coolingSetpoint ?? seg.heatingSetpoint);
}

function decodeHandleBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Short hex label for a base64-encoded schedule/preset handle (e.g. a single-byte handle -> "0x01"). */
export function formatHandleShort(handle: string | null): string {
    if (!handle) return "";
    try {
        const bytes = decodeHandleBytes(handle);
        return `0x${Array.from(bytes)
            .map(b => b.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()}`;
    } catch {
        return handle.slice(0, 8);
    }
}
