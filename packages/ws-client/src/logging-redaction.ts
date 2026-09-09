/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `device_command` payload fields that carry a Matter PIN. The wire format encodes them as base64
 * octstr, which is trivially reversible, so logging them verbatim writes the plaintext door PIN to
 * the browser/server console.
 */
const SENSITIVE_PAYLOAD_FIELDS = ["credentialData", "pinCode"];

/**
 * Returns `message` unchanged, or a shallow copy with any {@link SENSITIVE_PAYLOAD_FIELDS} in its
 * `args.payload` replaced by a placeholder — safe to pass to a debug logger on both the client and
 * server side of the same wire message.
 */
export function redactSensitiveCommandFields<T extends { args?: unknown }>(message: T): T {
    const args = message.args;
    if (args === null || typeof args !== "object") return message;
    const payload = (args as Record<string, unknown>)["payload"];
    if (payload === null || typeof payload !== "object") return message;
    const payloadRecord = payload as Record<string, unknown>;
    const sensitiveKeys = SENSITIVE_PAYLOAD_FIELDS.filter(key => key in payloadRecord);
    if (sensitiveKeys.length === 0) return message;
    const redactedPayload = { ...payloadRecord };
    for (const key of sensitiveKeys) redactedPayload[key] = "[redacted]";
    return { ...message, args: { ...(args as Record<string, unknown>), payload: redactedPayload } };
}
