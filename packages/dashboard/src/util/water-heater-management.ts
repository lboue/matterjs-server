/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterClient } from "@matter-server/ws-client";
import { toNumber } from "./attribute-shapes.js";

export const WATER_HEATER_MANAGEMENT_CLUSTER_ID = 0x0094; // 148

const ATTR_HEATER_TYPES = 0x00;
const ATTR_HEAT_DEMAND = 0x01;
const ATTR_TANK_VOLUME = 0x02;
const ATTR_ESTIMATED_HEAT_REQUIRED = 0x03;
const ATTR_TANK_PERCENTAGE = 0x04;
const ATTR_BOOST_STATE = 0x05;
const ATTR_FEATURE_MAP = 0xfffc;

const HEATER_TYPE_NAMES: Record<number, string> = {
    0: "Immersion Element 1",
    1: "Immersion Element 2",
    2: "Heat Pump",
    3: "Boiler",
    4: "Other",
};

const BOOST_STATE_NAMES: Record<number, string> = {
    0: "Inactive",
    1: "Active",
};

const FEATURE_ENERGY_MANAGEMENT = 1 << 0;
const FEATURE_TANK_PERCENT = 1 << 1;

function attr(attributes: Record<string, unknown>, endpoint: number, attributeId: number): unknown {
    return attributes[`${endpoint}/${WATER_HEATER_MANAGEMENT_CLUSTER_ID}/${attributeId}`];
}

function heaterTypesToNames(bitmap: number): string[] {
    const names: string[] = [];
    for (let bit = 0; bit < 5; bit++) {
        if ((bitmap & (1 << bit)) !== 0) {
            names.push(HEATER_TYPE_NAMES[bit] ?? `Unknown (${bit})`);
        }
    }
    return names;
}

export interface BoostInfoStruct {
    duration: number; // seconds
    oneShot?: boolean;
    emergencyBoost?: boolean;
    temporarySetpoint?: number; // Celsius
    targetPercentage?: number; // 0-100%
    targetReheat?: number; // 0-100%
}

export interface WaterHeaterManagementInfo {
    supported: boolean;
    heaterTypes?: string[]; // Names of active heater types
    heaterTypesBitmap?: number;
    heatDemandTypes?: string[]; // Currently demanding heat
    heatDemandBitmap?: number;
    tankPercentage?: number; // 0-100
    boostState?: string; // "Inactive" or "Active"
    boostStateValue?: number;
    boostActive?: boolean; // Convenience flag: boostStateValue === 1
    tankVolumeL?: number; // Liters (if EM feature supported)
    estimatedHeatRequiredMwh?: number; // if EM feature supported
    supportsEnergyManagement?: boolean;
    supportsTankPercent?: boolean;
}

export function waterHeaterManagementInfo(
    attributes: Record<string, unknown>,
    endpoint: number,
): WaterHeaterManagementInfo {
    const result: WaterHeaterManagementInfo = { supported: false };
    let hasAnyAttribute = false;

    const heaterTypes = toNumber(attr(attributes, endpoint, ATTR_HEATER_TYPES));
    if (heaterTypes !== undefined) {
        hasAnyAttribute = true;
        result.heaterTypesBitmap = heaterTypes;
        result.heaterTypes = heaterTypesToNames(heaterTypes);
    }

    const heatDemand = toNumber(attr(attributes, endpoint, ATTR_HEAT_DEMAND));
    if (heatDemand !== undefined) {
        hasAnyAttribute = true;
        result.heatDemandBitmap = heatDemand;
        result.heatDemandTypes = heaterTypesToNames(heatDemand);
    }

    const tankVolume = toNumber(attr(attributes, endpoint, ATTR_TANK_VOLUME));
    if (tankVolume !== undefined) {
        hasAnyAttribute = true;
        result.tankVolumeL = tankVolume; // Already in liters
    }

    const estimatedHeatRequired = toNumber(attr(attributes, endpoint, ATTR_ESTIMATED_HEAT_REQUIRED));
    if (estimatedHeatRequired !== undefined) {
        hasAnyAttribute = true;
        result.estimatedHeatRequiredMwh = estimatedHeatRequired;
    }

    const tankPercentage = toNumber(attr(attributes, endpoint, ATTR_TANK_PERCENTAGE));
    if (tankPercentage !== undefined) {
        hasAnyAttribute = true;
        result.tankPercentage = tankPercentage;
    }

    const boostStateValue = toNumber(attr(attributes, endpoint, ATTR_BOOST_STATE));
    if (boostStateValue !== undefined) {
        hasAnyAttribute = true;
        result.boostStateValue = boostStateValue;
        result.boostState = BOOST_STATE_NAMES[boostStateValue] ?? `Unknown (${boostStateValue})`;
        result.boostActive = boostStateValue === 1;
    }

    const featureMap = toNumber(attr(attributes, endpoint, ATTR_FEATURE_MAP));
    if (featureMap !== undefined) {
        hasAnyAttribute = true;
        result.supportsEnergyManagement = (featureMap & FEATURE_ENERGY_MANAGEMENT) !== 0;
        result.supportsTankPercent = (featureMap & FEATURE_TANK_PERCENT) !== 0;
    }

    result.supported = hasAnyAttribute;
    return result;
}

export async function startBoost(
    client: MatterClient,
    nodeId: number | bigint,
    endpoint: number,
    params: BoostInfoStruct,
): Promise<boolean> {
    try {
        const boostInfo: Record<string, unknown> = {
            duration: params.duration,
        };

        if (params.oneShot !== undefined) {
            boostInfo.oneShot = params.oneShot;
        }
        if (params.emergencyBoost !== undefined) {
            boostInfo.emergencyBoost = params.emergencyBoost;
        }
        if (params.temporarySetpoint !== undefined) {
            // Convert Celsius to Matter temperature (in 0.01°C units)
            boostInfo.temporarySetpoint = Math.round(params.temporarySetpoint * 100);
        }
        if (params.targetPercentage !== undefined) {
            boostInfo.targetPercentage = params.targetPercentage;
        }
        if (params.targetReheat !== undefined) {
            boostInfo.targetReheat = params.targetReheat;
        }

        await client.deviceCommand(nodeId, endpoint, WATER_HEATER_MANAGEMENT_CLUSTER_ID, "Boost", {
            boostInfo,
        });
        return true;
    } catch (err) {
        console.error("Failed to start boost:", err);
        return false;
    }
}

export async function cancelBoost(client: MatterClient, nodeId: number | bigint, endpoint: number): Promise<boolean> {
    try {
        await client.deviceCommand(nodeId, endpoint, WATER_HEATER_MANAGEMENT_CLUSTER_ID, "CancelBoost");
        return true;
    } catch (err) {
        console.error("Failed to cancel boost:", err);
        return false;
    }
}
