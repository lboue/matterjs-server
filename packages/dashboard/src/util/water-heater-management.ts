/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterClient } from "@matter-server/ws-client";
import { toNumber } from "./attribute-shapes.js";

export const WATER_HEATER_MANAGEMENT_CLUSTER_ID = 0x009d; // 157

const ATTR_HEATING_SET_POINT = 0x00;
const ATTR_MAX_HEAT_SET_POINT = 0x01;
const ATTR_MIN_HEAT_SET_POINT = 0x02;
const ATTR_REHEAT_SET_POINT = 0x03;
const ATTR_MAX_REHEAT_SET_POINT = 0x04;
const ATTR_MIN_REHEAT_SET_POINT = 0x05;
const ATTR_WATER_HEATER_MODE = 0x06;
const ATTR_WATER_HEATER_STATE = 0x07;
const ATTR_FEATURE_MAP = 0xfffc;

const MODE_NAMES: Record<number, string> = {
    0: "Off",
    1: "Heat pump only",
    2: "Resistive heating",
    3: "Heat pump and resistive",
};

const STATE_NAMES: Record<number, string> = {
    0: "Idle",
    1: "Heating",
    2: "Boost active",
    3: "Fault",
};

const FEATURE_BOOST = 1 << 0;
const FEATURE_REHEAT = 1 << 1;

function attr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): unknown {
    return attributes[`${endpoint}/${WATER_HEATER_MANAGEMENT_CLUSTER_ID}/${attributeId}`];
}

function celsiusFromMatterTemp(temp: number): number {
    return temp / 100;
}

function matterTempFromCelsius(temp: number): number {
    return Math.round(temp * 100);
}

export interface BoostInfoStruct {
    duration?: number;
    oneShot?: boolean;
    emergencyBoost?: boolean;
    temporarySetpoint?: number;
    targetPercentage?: number;
    targetReheat?: number;
}

export interface WaterHeaterManagementInfo {
    supported: boolean;
    heatingSetpointC?: number;
    maxHeatingSetpointC?: number;
    minHeatingSetpointC?: number;
    reheatSetpointC?: number;
    maxReheatSetpointC?: number;
    minReheatSetpointC?: number;
    mode?: string;
    modeValue?: number;
    state?: string;
    stateValue?: number;
    boostActive?: boolean;
    supportsBoost?: boolean;
    supportsReheat?: boolean;
}

export function waterHeaterManagementInfo(
    attributes: Record<string, unknown>,
    endpoint: number,
): WaterHeaterManagementInfo {
    const result: WaterHeaterManagementInfo = { supported: true };

    const heatingSetpoint = toNumber(attr(attributes, endpoint, ATTR_HEATING_SET_POINT));
    if (heatingSetpoint !== undefined) {
        result.heatingSetpointC = celsiusFromMatterTemp(heatingSetpoint);
    }

    const maxHeatingSetpoint = toNumber(attr(attributes, endpoint, ATTR_MAX_HEAT_SET_POINT));
    if (maxHeatingSetpoint !== undefined) {
        result.maxHeatingSetpointC = celsiusFromMatterTemp(maxHeatingSetpoint);
    }

    const minHeatingSetpoint = toNumber(attr(attributes, endpoint, ATTR_MIN_HEAT_SET_POINT));
    if (minHeatingSetpoint !== undefined) {
        result.minHeatingSetpointC = celsiusFromMatterTemp(minHeatingSetpoint);
    }

    const reheatSetpoint = toNumber(attr(attributes, endpoint, ATTR_REHEAT_SET_POINT));
    if (reheatSetpoint !== undefined) {
        result.reheatSetpointC = celsiusFromMatterTemp(reheatSetpoint);
    }

    const maxReheatSetpoint = toNumber(attr(attributes, endpoint, ATTR_MAX_REHEAT_SET_POINT));
    if (maxReheatSetpoint !== undefined) {
        result.maxReheatSetpointC = celsiusFromMatterTemp(maxReheatSetpoint);
    }

    const minReheatSetpoint = toNumber(attr(attributes, endpoint, ATTR_MIN_REHEAT_SET_POINT));
    if (minReheatSetpoint !== undefined) {
        result.minReheatSetpointC = celsiusFromMatterTemp(minReheatSetpoint);
    }

    const modeValue = toNumber(attr(attributes, endpoint, ATTR_WATER_HEATER_MODE));
    if (modeValue !== undefined) {
        result.modeValue = modeValue;
        result.mode = MODE_NAMES[modeValue] ?? `Unknown (${modeValue})`;
    }

    const stateValue = toNumber(attr(attributes, endpoint, ATTR_WATER_HEATER_STATE));
    if (stateValue !== undefined) {
        result.stateValue = stateValue;
        result.state = STATE_NAMES[stateValue] ?? `Unknown (${stateValue})`;
        result.boostActive = stateValue === 2;
    }

    const featureMap = toNumber(attr(attributes, endpoint, ATTR_FEATURE_MAP));
    if (featureMap !== undefined) {
        result.supportsBoost = (featureMap & FEATURE_BOOST) !== 0;
        result.supportsReheat = (featureMap & FEATURE_REHEAT) !== 0;
    }

    return result;
}

export async function startBoost(
    client: MatterClient,
    nodeId: number | bigint,
    endpoint: number,
    params: BoostInfoStruct,
): Promise<boolean> {
    try {
        await client.deviceCommand(
            nodeId,
            endpoint,
            WATER_HEATER_MANAGEMENT_CLUSTER_ID,
            "StartBoost",
            params as Record<string, unknown>,
        );
        return true;
    } catch (err) {
        console.error("Failed to start boost:", err);
        return false;
    }
}

export async function stopBoost(client: MatterClient, nodeId: number | bigint, endpoint: number): Promise<boolean> {
    try {
        await client.deviceCommand(nodeId, endpoint, WATER_HEATER_MANAGEMENT_CLUSTER_ID, "StopBoost");
        return true;
    } catch (err) {
        console.error("Failed to stop boost:", err);
        return false;
    }
}

export async function setHeatingSetpoint(
    client: MatterClient,
    nodeId: number | bigint,
    endpoint: number,
    temperatureCelsius: number,
): Promise<boolean> {
    try {
        const matterTemp = matterTempFromCelsius(temperatureCelsius);
        await client.deviceCommand(nodeId, endpoint, WATER_HEATER_MANAGEMENT_CLUSTER_ID, "SetHeatingSetpoint", {
            heatingSetpoint: matterTemp,
        });
        return true;
    } catch (err) {
        console.error("Failed to set heating setpoint:", err);
        return false;
    }
}
