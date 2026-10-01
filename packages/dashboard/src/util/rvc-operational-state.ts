/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { asObject, pickNumber, tagField, toNumber, toText } from "./attribute-shapes.js";

/** RvcOperationalState cluster (Matter Application Clusters spec, § 7.4). */
export const RVC_OPERATIONAL_STATE_CLUSTER_ID = 97; // 0x0061

export const OPERATIONAL_STATE_ATTR = 4;
export const OPERATIONAL_ERROR_ATTR = 5;

/** ErrorStateStruct field tags (spec § 1.14.4.4). */
const ERROR_STATE_ID_FIELD = 0;
const ERROR_STATE_DETAILS_FIELD = 2;

/** OperationalStateEnum, including the RVC-specific states (spec § 7.4.4.1). */
export enum OperationalState {
    Stopped = 0,
    Running = 1,
    Paused = 2,
    Error = 3,
    SeekingCharger = 64,
    Charging = 65,
    Docked = 66,
}

const OPERATIONAL_STATE_NAMES: Record<number, string> = {
    [OperationalState.Stopped]: "Stopped",
    [OperationalState.Running]: "Running",
    [OperationalState.Paused]: "Paused",
    [OperationalState.Error]: "Error",
    [OperationalState.SeekingCharger]: "Seeking Charger",
    [OperationalState.Charging]: "Charging",
    [OperationalState.Docked]: "Docked",
};

/** ErrorStateEnum, including the RVC-specific errors (spec § 7.4.4.2). */
export enum ErrorState {
    NoError = 0,
    UnableToStartOrResume = 1,
    UnableToCompleteOperation = 2,
    CommandInvalidInState = 3,
    FailedToFindChargingDock = 64,
    Stuck = 65,
    DustBinMissing = 66,
    DustBinFull = 67,
    WaterTankEmpty = 68,
    WaterTankMissing = 69,
    WaterTankLidOpen = 70,
    MopCleaningPadMissing = 71,
    LowBattery = 72,
    CannotReachTargetArea = 73,
    DirtyWaterTankFull = 74,
    DirtyWaterTankMissing = 75,
    WheelsJammed = 76,
    BrushJammed = 77,
    NavigationSensorObscured = 78,
}

const ERROR_STATE_NAMES: Record<number, string> = {
    [ErrorState.NoError]: "No Error",
    [ErrorState.UnableToStartOrResume]: "Unable to Start or Resume",
    [ErrorState.UnableToCompleteOperation]: "Unable to Complete Operation",
    [ErrorState.CommandInvalidInState]: "Command Invalid in Current State",
    [ErrorState.FailedToFindChargingDock]: "Failed to Find Charging Dock",
    [ErrorState.Stuck]: "Stuck",
    [ErrorState.DustBinMissing]: "Dust Bin Missing",
    [ErrorState.DustBinFull]: "Dust Bin Full",
    [ErrorState.WaterTankEmpty]: "Water Tank Empty",
    [ErrorState.WaterTankMissing]: "Water Tank Missing",
    [ErrorState.WaterTankLidOpen]: "Water Tank Lid Open",
    [ErrorState.MopCleaningPadMissing]: "Mop Cleaning Pad Missing",
    [ErrorState.LowBattery]: "Low Battery",
    [ErrorState.CannotReachTargetArea]: "Cannot Reach Target Area",
    [ErrorState.DirtyWaterTankFull]: "Dirty Water Tank Full",
    [ErrorState.DirtyWaterTankMissing]: "Dirty Water Tank Missing",
    [ErrorState.WheelsJammed]: "Wheels Jammed",
    [ErrorState.BrushJammed]: "Brush Jammed",
    [ErrorState.NavigationSensorObscured]: "Navigation Sensor Obscured",
};

export function operationalStateLabel(id: number): string {
    return OPERATIONAL_STATE_NAMES[id] ?? `Unknown (${id})`;
}

export function errorStateLabel(id: number): string {
    return ERROR_STATE_NAMES[id] ?? `Unknown (${id})`;
}

/** Decoded ErrorStateStruct, used for both the attribute and command responses. */
export interface ErrorStateInfo {
    errorStateId: number;
    /** NoError (0) is a healthy status, not a fault, so callers must not style it as an error. */
    isError: boolean;
    label: string;
    details?: string;
}

/**
 * OperationalState attribute is a plain enum. Returns null when the attribute is absent or
 * not a number, so the UI shows nothing rather than a fabricated state.
 */
export function describeOperationalState(value: unknown): string | null {
    const id = toNumber(value);
    return id === undefined ? null : operationalStateLabel(id);
}

/**
 * OperationalError attribute is an ErrorStateStruct delivered field-tag keyed
 * (see {@link tagField}), so the id lives at tag 0 and the detail string at tag 2.
 */
export function decodeOperationalError(value: unknown): ErrorStateInfo | null {
    const obj = asObject(value);
    if (obj === null) return null;
    const id = toNumber(tagField(obj, ERROR_STATE_ID_FIELD));
    if (id === undefined) return null;
    return {
        errorStateId: id,
        isError: id !== ErrorState.NoError,
        label: errorStateLabel(id),
        details: toText(tagField(obj, ERROR_STATE_DETAILS_FIELD)),
    };
}

/**
 * OperationalCommandResponse carries a commandResponseState (ErrorStateStruct) whose errorStateId
 * reports rejection even when the invoke itself succeeds, so a successful transport does not mean the
 * device accepted the command. Unlike the attribute, the response reaches the client name keyed.
 */
export function decodeOperationalCommandResponse(response: unknown): ErrorStateInfo | null {
    const state = asObject(asObject(response)?.["commandResponseState"]);
    if (state === null) return null;
    const id = pickNumber(state, "errorStateId");
    if (id === null) return null;
    return {
        errorStateId: id,
        isError: id !== ErrorState.NoError,
        label: errorStateLabel(id),
        details: toText(state["errorStateDetails"]),
    };
}
