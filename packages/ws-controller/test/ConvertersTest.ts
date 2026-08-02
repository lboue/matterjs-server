/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Thermostat } from "@matter/main/clusters";
import { ClusterMap } from "../src/model/ModelMapper.js";
import { convertWebSocketTagBasedToMatter } from "../src/server/Converters.js";

describe("convertWebSocketTagBasedToMatter", () => {
    const clusterEntry = ClusterMap[Thermostat.Cluster.id];
    if (clusterEntry === undefined) {
        throw new Error("Thermostat cluster missing from ClusterMap");
    }
    const presetsAttribute = clusterEntry.attributes.presets;
    if (presetsAttribute === undefined) {
        throw new Error("Thermostat Presets attribute missing from ClusterMap");
    }
    const presetStructModel = presetsAttribute.members.at(0);
    if (presetStructModel === undefined) {
        throw new Error("Thermostat Presets member model missing");
    }

    const handleBase64 = Bytes.toBase64(Bytes.fromHex("aabbcc"));

    it("resolves struct members by numeric TLV tag (matter-server >=1.3.0 python client)", () => {
        const result = convertWebSocketTagBasedToMatter(
            { "0": handleBase64, "1": 1, "5": true },
            presetStructModel,
            clusterEntry.model,
        ) as Record<string, unknown>;

        expect(Bytes.toHex(result.presetHandle as Uint8Array)).to.equal("aabbcc");
        expect(result.presetScenario).to.equal(1);
        expect(result.builtIn).to.equal(true);
    });

    it("falls back to wire field names for pre-1.3.0 python clients that serialized by name", () => {
        const result = convertWebSocketTagBasedToMatter(
            { presetHandle: handleBase64, presetScenario: 1, builtIn: true },
            presetStructModel,
            clusterEntry.model,
        ) as Record<string, unknown>;

        expect(Bytes.toHex(result.presetHandle as Uint8Array)).to.equal("aabbcc");
        expect(result.presetScenario).to.equal(1);
        expect(result.builtIn).to.equal(true);
    });

    it("keeps genuinely unknown keys as-is", () => {
        const result = convertWebSocketTagBasedToMatter(
            { notARealField: "value" },
            presetStructModel,
            clusterEntry.model,
        ) as Record<string, unknown>;

        expect(result.notARealField).to.equal("value");
    });
});
