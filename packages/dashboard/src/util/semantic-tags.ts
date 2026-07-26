/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { semantic_tag_namespaces } from "../client/models/descriptions.js";
import { attributeArray } from "./access-control.js";
import { formatHex } from "./format_hex.js";

// Descriptor cluster and its TagList attribute (semantic tags for the endpoint)
export const DESCRIPTOR_CLUSTER_ID = 29;
export const TAG_LIST_ATTR = 4;

export interface SemanticTag {
    mfgCode: number | null;
    namespaceId: number;
    tag: number;
    label: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** SemanticTagStruct wire entries are field-tag keyed: "0" MfgCode, "1" NamespaceID, "2" Tag, "3" Label. */
function decodeSemanticTag(entry: unknown): SemanticTag | undefined {
    if (!isRecord(entry)) return undefined;
    const namespaceId = entry["1"];
    const tag = entry["2"];
    if (typeof namespaceId !== "number" || typeof tag !== "number") return undefined;
    const mfgCode = entry["0"];
    const label = entry["3"];
    return {
        mfgCode: typeof mfgCode === "number" ? mfgCode : null,
        namespaceId,
        tag,
        label: typeof label === "string" ? label : null,
    };
}

// Decodes the Descriptor cluster's TagList attribute value, or undefined if the attribute
// hasn't been read yet or its entries don't look like SemanticTagStruct.
export function decodeSemanticTagList(value: unknown): SemanticTag[] | undefined {
    if (value === undefined) return undefined;
    const entries = attributeArray(value);
    const decoded = entries.map(decodeSemanticTag);
    if (decoded.some(tag => tag === undefined)) return undefined;
    return decoded as SemanticTag[];
}

// Renders a single semantic tag as "Namespace → Tag", falling back to raw ids when the
// namespace is manufacturer-specific or unrecognized (standard namespaces only cover Matter's
// own registry, not vendor-defined ones referenced via mfgCode).
export function describeSemanticTag(semtag: SemanticTag): { text: string; title: string } {
    const { mfgCode, namespaceId, tag, label } = semtag;
    const idSuffix = ` (ns ${namespaceId}, tag ${tag})`;

    if (mfgCode != null) {
        const text = label ? `Mfg ${formatHex(mfgCode)}: ${label}` : `Mfg ${formatHex(mfgCode)} tag ${tag}`;
        return { text, title: `Manufacturer-specific${idSuffix}, mfgCode ${formatHex(mfgCode)}` };
    }

    const namespace = semantic_tag_namespaces[namespaceId];
    const tagInfo = namespace?.tags[tag];
    const namespaceLabel = namespace?.label ?? `Namespace ${namespaceId}`;
    const tagLabel = tagInfo?.label ?? `Tag ${tag}`;
    const text = label ? `${namespaceLabel} → ${tagLabel} ("${label}")` : `${namespaceLabel} → ${tagLabel}`;
    return { text, title: `${namespaceLabel} → ${tagLabel}${idSuffix}` };
}
