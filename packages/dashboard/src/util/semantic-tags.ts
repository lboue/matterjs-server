/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { semantic_tag_namespaces } from "../client/models/descriptions.js";
import { formatHex } from "./format_hex.js";

// Descriptor cluster and its TagList attribute (semantic tags for the endpoint)
export const DESCRIPTOR_CLUSTER_ID = 29;
export const TAG_LIST_ATTR = 4;

export interface SemanticTag {
    mfgCode: number | null;
    namespaceId: number;
    tag: number;
    label?: string | null;
}

export function isSemanticTagList(value: unknown): value is SemanticTag[] {
    return (
        Array.isArray(value) &&
        value.every(entry => entry && typeof entry === "object" && "namespaceId" in entry && "tag" in entry)
    );
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
