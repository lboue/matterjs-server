/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { asObject, pickNumber, tagField, toNumber, toText } from "./attribute-shapes.js";

/** OperationalState cluster (Matter Application Clusters spec, § 1.14). */
export const OPERATIONAL_STATE_CLUSTER_ID = 96; // 0x0060

export const OPERATIONAL_STATE_LIST_ATTR = 3;
export const OPERATIONAL_STATE_ATTR = 4;
export const OPERATIONAL_ERROR_ATTR = 5;
/** Global AcceptedCommandList attribute (spec § 7.13). */
export const ACCEPTED_COMMAND_LIST_ATTR = 0xfff9; // 65529

/** ErrorStateStruct field tags (spec § 1.14.4.4). */
const ERROR_STATE_ID_FIELD = 0;
const ERROR_STATE_LABEL_FIELD = 1;
const ERROR_STATE_DETAILS_FIELD = 2;

/** OperationalStateStruct field tags (spec § 1.14.4.3). */
const OPERATIONAL_STATE_ID_FIELD = 0;
const OPERATIONAL_STATE_LABEL_FIELD = 1;

/** OperationalStateEnum base values (spec § 1.14.4.1); 0x80-0xBF are manufacturer specific. */
export enum OperationalState {
    Stopped = 0,
    Running = 1,
    Paused = 2,
    Error = 3,
}

const OPERATIONAL_STATE_NAMES: Record<number, string> = {
    [OperationalState.Stopped]: "Stopped",
    [OperationalState.Running]: "Running",
    [OperationalState.Paused]: "Paused",
    [OperationalState.Error]: "Error",
};

/** ErrorStateEnum base values (spec § 1.14.4.2); 0x80-0xBF are manufacturer specific. */
export enum ErrorState {
    NoError = 0,
    UnableToStartOrResume = 1,
    UnableToCompleteOperation = 2,
    CommandInvalidInState = 3,
}

const ERROR_STATE_NAMES: Record<number, string> = {
    [ErrorState.NoError]: "No Error",
    [ErrorState.UnableToStartOrResume]: "Unable to Start or Resume",
    [ErrorState.UnableToCompleteOperation]: "Unable to Complete Operation",
    [ErrorState.CommandInvalidInState]: "Command Invalid in Current State",
};

/** Command IDs for the base OperationalState cluster (spec § 1.14.6). */
export enum OperationalCommand {
    Pause = 0,
    Stop = 1,
    Start = 2,
    Resume = 3,
}

/**
 * Manufacturer-specific states/errors (IDs 128-191) carry no base name, so the device supplies a
 * display label alongside the id; it is used only when the base enum does not recognise the id.
 */
export function operationalStateLabel(id: number, deviceLabel?: string): string {
    return OPERATIONAL_STATE_NAMES[id] ?? deviceLabel ?? `Unknown (${id})`;
}

export function errorStateLabel(id: number, deviceLabel?: string): string {
    return ERROR_STATE_NAMES[id] ?? deviceLabel ?? `Unknown (${id})`;
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
 * OperationalStateList (attribute 3) is an array of OperationalStateStruct carrying the
 * OperationalStateLabel for manufacturer-specific ids. Entries reach the dashboard field-tag keyed.
 */
function operationalStateLabelFromList(stateList: unknown, id: number): string | undefined {
    if (!Array.isArray(stateList)) return undefined;
    for (const entry of stateList) {
        const obj = asObject(entry);
        if (obj !== null && toNumber(tagField(obj, OPERATIONAL_STATE_ID_FIELD)) === id) {
            return toText(tagField(obj, OPERATIONAL_STATE_LABEL_FIELD));
        }
    }
    return undefined;
}

/**
 * OperationalState attribute is a plain enum. Returns null when the attribute is absent or
 * not a number, so the UI shows nothing rather than a fabricated state. For manufacturer-specific
 * ids it resolves the label from OperationalStateList when that attribute is supplied.
 */
export function describeOperationalState(value: unknown, stateList?: unknown): string | null {
    const id = toNumber(value);
    if (id === undefined) return null;
    return operationalStateLabel(id, operationalStateLabelFromList(stateList, id));
}

/**
 * OperationalError attribute is an ErrorStateStruct delivered field-tag keyed
 * (see {@link tagField}): the id lives at tag 0, the manufacturer label at tag 1, details at tag 2.
 */
export function decodeOperationalError(value: unknown): ErrorStateInfo | null {
    const obj = asObject(value);
    if (obj === null) return null;
    const id = toNumber(tagField(obj, ERROR_STATE_ID_FIELD));
    if (id === undefined) return null;
    return {
        errorStateId: id,
        isError: id !== ErrorState.NoError,
        label: errorStateLabel(id, toText(tagField(obj, ERROR_STATE_LABEL_FIELD))),
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
        label: errorStateLabel(id, toText(state["errorStateLabel"])),
        details: toText(state["errorStateDetails"]),
    };
}

/**
 * AcceptedCommandList (attribute 0xFFF9) lists the command ids this cluster instance accepts. Every
 * OperationalState command is optional, so an absent or malformed list means no command is supported
 * rather than all of them; the empty set then gates every button off.
 */
export function decodeAcceptedCommands(value: unknown): ReadonlySet<number> {
    const ids = new Set<number>();
    if (!Array.isArray(value)) return ids;
    for (const entry of value) {
        const id = toNumber(entry);
        if (id !== undefined) ids.add(id);
    }
    return ids;
}
