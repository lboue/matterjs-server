/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

export const METER_IDENTIFICATION_CLUSTER_ID = 2822;

const METER_TYPE_NAMES: Record<number, string> = {
    0: "Utility",
    1: "Private",
    2: "Generic",
};

const POWER_THRESHOLD_SOURCE_NAMES: Record<number, string> = {
    0: "Contract",
    1: "Legal regulator",
    2: "Meter equipment limit",
};

/** MeterIdentification FeatureMap bits per Matter 1.6 §2.13.4. */
const POWER_THRESHOLD_FEATURE_BIT = 0b1;

export interface PowerThresholdInfo {
    powerThresholdW?: number;
    apparentPowerThresholdVA?: number;
    source?: string;
}

export interface MeterIdentificationInfo {
    supported: boolean;
    meterType?: string;
    pointOfDelivery?: string;
    meterSerialNumber?: string;
    protocolVersion?: string;
    powerThresholdSupported: boolean;
    powerThreshold?: PowerThresholdInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Wire-format structs are field-tag keyed (e.g. `{"0": ..., "1": ...}`), not camelCase field names. */
function field(value: unknown, tag: number): unknown {
    return isRecord(value) ? value[String(tag)] : undefined;
}

function attr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): unknown {
    return attributes[`${endpoint}/${METER_IDENTIFICATION_CLUSTER_ID}/${attributeId}`];
}

function stringAttr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): string | undefined {
    const value = attr(attributes, endpoint, attributeId);
    return typeof value === "string" ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
    return typeof value === "number" || typeof value === "bigint" ? Number(value) : undefined;
}

function decodePowerThreshold(value: unknown): PowerThresholdInfo | undefined {
    if (!isRecord(value)) return undefined;
    const powerThreshold = numberOrUndefined(field(value, 0));
    const apparentPowerThreshold = numberOrUndefined(field(value, 1));
    const source = field(value, 2);
    return {
        powerThresholdW: powerThreshold !== undefined ? powerThreshold / 1000 : undefined,
        apparentPowerThresholdVA: apparentPowerThreshold !== undefined ? apparentPowerThreshold / 1000 : undefined,
        source:
            typeof source === "number" ? (POWER_THRESHOLD_SOURCE_NAMES[source] ?? `Unknown (${source})`) : undefined,
    };
}

export function meterIdentificationInfo(
    attributes: Record<string, unknown>,
    endpoint: number,
): MeterIdentificationInfo {
    const featureMap = attr(attributes, endpoint, 65532);
    const featureBits = numberOrUndefined(featureMap) ?? 0;
    const powerThresholdSupported = (featureBits & POWER_THRESHOLD_FEATURE_BIT) !== 0;
    const meterTypeRaw = numberOrUndefined(attr(attributes, endpoint, 0));

    return {
        supported: featureMap !== undefined,
        meterType:
            meterTypeRaw !== undefined ? (METER_TYPE_NAMES[meterTypeRaw] ?? `Unknown (${meterTypeRaw})`) : undefined,
        pointOfDelivery: stringAttr(attributes, endpoint, 1),
        meterSerialNumber: stringAttr(attributes, endpoint, 2),
        protocolVersion: stringAttr(attributes, endpoint, 3),
        powerThresholdSupported,
        powerThreshold: decodePowerThreshold(attr(attributes, endpoint, 4)),
    };
}
