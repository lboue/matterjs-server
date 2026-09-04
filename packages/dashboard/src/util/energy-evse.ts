/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { toNumber, toText } from "./attribute-shapes.js";

export const ENERGY_EVSE_CLUSTER_ID = 153; // 0x99

const ATTR_STATE = 0x00;
const ATTR_SUPPLY_STATE = 0x01;
const ATTR_FAULT_STATE = 0x02;
const ATTR_CHARGING_ENABLED_UNTIL = 0x03;
const ATTR_DISCHARGING_ENABLED_UNTIL = 0x04;
const ATTR_CIRCUIT_CAPACITY = 0x05;
const ATTR_MINIMUM_CHARGE_CURRENT = 0x06;
const ATTR_MAXIMUM_CHARGE_CURRENT = 0x07;
const ATTR_MAXIMUM_DISCHARGE_CURRENT = 0x08;
const ATTR_USER_MAXIMUM_CHARGE_CURRENT = 0x09;
const ATTR_RANDOMIZATION_DELAY_WINDOW = 0x0a;
const ATTR_NEXT_CHARGE_START_TIME = 0x23;
const ATTR_NEXT_CHARGE_TARGET_TIME = 0x24;
const ATTR_NEXT_CHARGE_REQUIRED_ENERGY = 0x25;
const ATTR_NEXT_CHARGE_TARGET_SOC = 0x26;
const ATTR_APPROXIMATE_EV_EFFICIENCY = 0x27;
const ATTR_STATE_OF_CHARGE = 0x30;
const ATTR_BATTERY_CAPACITY = 0x31;
const ATTR_VEHICLE_ID = 0x32;
const ATTR_SESSION_ID = 0x40;
const ATTR_SESSION_DURATION = 0x41;
const ATTR_SESSION_ENERGY_CHARGED = 0x42;
const ATTR_SESSION_ENERGY_DISCHARGED = 0x43;
const ATTR_FEATURE_MAP = 0xfffc;

/** EnergyEvse FeatureMap bits per Matter 1.6 §9.3.4. */
const FEATURE_BIT_CHARGING_PREFERENCES = 0b1;
const FEATURE_BIT_SOC_REPORTING = 0b10;
const FEATURE_BIT_PLUG_AND_CHARGE = 0b100;
const FEATURE_BIT_V2X = 0b10000;

const STATE_NAMES: Record<number, string> = {
    0: "Not plugged in",
    1: "Plugged in, no demand",
    2: "Plugged in, demand (not allowed)",
    3: "Plugged in, charging",
    4: "Plugged in, discharging",
    5: "Session ending",
    6: "Fault",
};

const SUPPLY_STATE_NAMES: Record<number, string> = {
    0: "Disabled",
    1: "Charging enabled",
    2: "Discharging enabled",
    3: "Disabled (error)",
    4: "Disabled (diagnostics)",
    5: "Charging and discharging enabled",
};

const FAULT_STATE_NAMES: Record<number, string> = {
    0: "No error",
    1: "Meter failure",
    2: "Over voltage",
    3: "Under voltage",
    4: "Over current",
    5: "Contact wet failure",
    6: "Contact dry failure",
    7: "Ground fault",
    8: "Power loss",
    9: "Power quality",
    10: "Pilot short circuit",
    11: "Emergency stop",
    12: "EV disconnected",
    13: "Wrong power supply",
    14: "Live/neutral swap",
    15: "Over temperature",
    255: "Other",
};

export interface SessionInfo {
    id: number;
    durationS?: number;
    energyChargedKWh?: number;
    energyDischargedKWh?: number;
}

export interface EnergyEvseInfo {
    supported: boolean;
    state?: string;
    supplyState?: string;
    faultState?: string;
    faultActive: boolean;
    /** undefined: not reported. null: no expiry, i.e. charging stays enabled until disabled explicitly. */
    chargingEnabledUntil?: number | null;
    circuitCapacityA?: number;
    minimumChargeCurrentA?: number;
    maximumChargeCurrentA?: number;
    userMaximumChargeCurrentA?: number;
    randomizationDelayWindowS?: number;
    /** undefined when the EV has never been plugged in (SessionID is still null). */
    session?: SessionInfo;

    v2xSupported: boolean;
    dischargingEnabledUntil?: number | null;
    maximumDischargeCurrentA?: number;

    chargingPreferencesSupported: boolean;
    nextChargeStartTime?: number | null;
    nextChargeTargetTime?: number | null;
    nextChargeRequiredEnergyKWh?: number | null;
    nextChargeTargetSoC?: number | null;
    approximateEvEfficiencyKmPerKWh?: number | null;

    soCReportingSupported: boolean;
    stateOfCharge?: number | null;
    batteryCapacityKWh?: number | null;

    plugAndChargeSupported: boolean;
    vehicleId?: string | null;
}

function attr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): unknown {
    return attributes[`${endpoint}/${ENERGY_EVSE_CLUSTER_ID}/${attributeId}`];
}

function enumName(value: unknown, names: Record<number, string>): string | undefined {
    const raw = toNumber(value);
    if (raw === undefined) return undefined;
    return names[raw] ?? `Unknown (${raw})`;
}

/** Distinguishes an attribute that hasn't been reported (undefined) from its explicit null value. */
function nullableNumber(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    return toNumber(value);
}

function nullableText(value: unknown): string | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    return toText(value) ?? null;
}

/** Scales a nullable reading (e.g. energy-mWh) to its display unit, passing null/undefined through unchanged. */
function scaleNullable(value: number | null | undefined, factor: number): number | null | undefined {
    return typeof value === "number" ? value / factor : value;
}

function toAmps(valueMa: number | undefined): number | undefined {
    return valueMa === undefined ? undefined : valueMa / 1000;
}

function decodeSession(attributes: Record<string, unknown>, endpoint: number): SessionInfo | undefined {
    const id = nullableNumber(attr(attributes, endpoint, ATTR_SESSION_ID));
    if (id === undefined || id === null) return undefined;
    return {
        id,
        durationS: toNumber(attr(attributes, endpoint, ATTR_SESSION_DURATION)),
        energyChargedKWh:
            scaleNullable(toNumber(attr(attributes, endpoint, ATTR_SESSION_ENERGY_CHARGED)), 1_000_000) ?? undefined,
        energyDischargedKWh:
            scaleNullable(toNumber(attr(attributes, endpoint, ATTR_SESSION_ENERGY_DISCHARGED)), 1_000_000) ?? undefined,
    };
}

export function energyEvseInfo(attributes: Record<string, unknown>, endpoint: number): EnergyEvseInfo {
    const featureMap = toNumber(attr(attributes, endpoint, ATTR_FEATURE_MAP));
    const faultStateRaw = toNumber(attr(attributes, endpoint, ATTR_FAULT_STATE));

    return {
        supported: featureMap !== undefined,
        state: enumName(attr(attributes, endpoint, ATTR_STATE), STATE_NAMES),
        supplyState: enumName(attr(attributes, endpoint, ATTR_SUPPLY_STATE), SUPPLY_STATE_NAMES),
        faultState: enumName(faultStateRaw, FAULT_STATE_NAMES),
        faultActive: faultStateRaw !== undefined && faultStateRaw !== 0,
        chargingEnabledUntil: nullableNumber(attr(attributes, endpoint, ATTR_CHARGING_ENABLED_UNTIL)),
        circuitCapacityA: toAmps(toNumber(attr(attributes, endpoint, ATTR_CIRCUIT_CAPACITY))),
        minimumChargeCurrentA: toAmps(toNumber(attr(attributes, endpoint, ATTR_MINIMUM_CHARGE_CURRENT))),
        maximumChargeCurrentA: toAmps(toNumber(attr(attributes, endpoint, ATTR_MAXIMUM_CHARGE_CURRENT))),
        userMaximumChargeCurrentA: toAmps(toNumber(attr(attributes, endpoint, ATTR_USER_MAXIMUM_CHARGE_CURRENT))),
        randomizationDelayWindowS: toNumber(attr(attributes, endpoint, ATTR_RANDOMIZATION_DELAY_WINDOW)),
        session: decodeSession(attributes, endpoint),

        v2xSupported: ((featureMap ?? 0) & FEATURE_BIT_V2X) !== 0,
        dischargingEnabledUntil: nullableNumber(attr(attributes, endpoint, ATTR_DISCHARGING_ENABLED_UNTIL)),
        maximumDischargeCurrentA: toAmps(toNumber(attr(attributes, endpoint, ATTR_MAXIMUM_DISCHARGE_CURRENT))),

        chargingPreferencesSupported: ((featureMap ?? 0) & FEATURE_BIT_CHARGING_PREFERENCES) !== 0,
        nextChargeStartTime: nullableNumber(attr(attributes, endpoint, ATTR_NEXT_CHARGE_START_TIME)),
        nextChargeTargetTime: nullableNumber(attr(attributes, endpoint, ATTR_NEXT_CHARGE_TARGET_TIME)),
        nextChargeRequiredEnergyKWh: scaleNullable(
            nullableNumber(attr(attributes, endpoint, ATTR_NEXT_CHARGE_REQUIRED_ENERGY)),
            1_000_000,
        ),
        nextChargeTargetSoC: nullableNumber(attr(attributes, endpoint, ATTR_NEXT_CHARGE_TARGET_SOC)),
        approximateEvEfficiencyKmPerKWh: scaleNullable(
            nullableNumber(attr(attributes, endpoint, ATTR_APPROXIMATE_EV_EFFICIENCY)),
            1000,
        ),

        soCReportingSupported: ((featureMap ?? 0) & FEATURE_BIT_SOC_REPORTING) !== 0,
        stateOfCharge: nullableNumber(attr(attributes, endpoint, ATTR_STATE_OF_CHARGE)),
        batteryCapacityKWh: scaleNullable(nullableNumber(attr(attributes, endpoint, ATTR_BATTERY_CAPACITY)), 1_000_000),

        plugAndChargeSupported: ((featureMap ?? 0) & FEATURE_BIT_PLUG_AND_CHARGE) !== 0,
        vehicleId: nullableText(attr(attributes, endpoint, ATTR_VEHICLE_ID)),
    };
}
