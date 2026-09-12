/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { decodeChangeToModeResult, deviceEnergyManagementModeInfo } from "../src/util/device-energy-management-mode.js";

/** ModeOptionStruct/ModeTagStruct entries are field-tag keyed: "0" Label/MfgCode, "1" Mode/Value, "2" ModeTags. */
const DEM_MODE_ATTRS: Record<string, unknown> = {
    "1/159/0": [
        { "0": "No Optimization", "1": 0, "2": [{ "1": 0x4000 }] },
        { "0": "Device Optimization", "1": 1, "2": [{ "1": 0x4001 }] },
        { "0": "Local Optimization", "1": 2, "2": [{ "1": 0x4002 }, { "1": 0x0000 }] },
    ],
    "1/159/1": 1,
    "1/159/2": 0,
    "1/159/3": 2,
};

describe("device energy management mode util", () => {
    it("reports no supported modes when the attribute is absent", () => {
        const info = deviceEnergyManagementModeInfo({}, 1);
        expect(info.supportedModes).to.deep.equal([]);
        expect(info.currentMode).to.equal(undefined);
    });

    it("decodes the supported modes list with their tags", () => {
        const info = deviceEnergyManagementModeInfo(DEM_MODE_ATTRS, 1);
        expect(info.supportedModes).to.have.length(3);
        expect(info.supportedModes[0]).to.deep.equal({
            label: "No Optimization",
            mode: 0,
            tags: [{ mfgCode: undefined, value: 0x4000, label: "NoOptimization" }],
        });
        expect(info.supportedModes[2].tags.map(t => t.label)).to.deep.equal(["LocalOptimization", "Auto"]);
    });

    it("resolves the current, start-up and on mode labels from the supported modes list", () => {
        const info = deviceEnergyManagementModeInfo(DEM_MODE_ATTRS, 1);
        expect(info.currentMode).to.equal(1);
        expect(info.currentModeLabel).to.equal("Device Optimization");
        expect(info.startUpMode).to.equal(0);
        expect(info.startUpModeLabel).to.equal("No Optimization");
        expect(info.onMode).to.equal(2);
        expect(info.onModeLabel).to.equal("Local Optimization");
    });

    it("falls back to a generated label for a supported mode without one", () => {
        const info = deviceEnergyManagementModeInfo({ "1/159/0": [{ "1": 5 }] }, 1);
        expect(info.supportedModes[0].label).to.equal("Mode 5");
    });

    it("names an unrecognized mode tag by its numeric value", () => {
        const info = deviceEnergyManagementModeInfo(
            { "1/159/0": [{ "0": "Custom", "1": 0, "2": [{ "1": 0x1234 }] }] },
            1,
        );
        expect(info.supportedModes[0].tags[0].label).to.equal("Tag 0x1234");
    });

    it("omits a mode tag entry that carries no value", () => {
        const info = deviceEnergyManagementModeInfo(
            { "1/159/0": [{ "0": "No Value", "1": 0, "2": [{ "0": 0xfff1 }] }] },
            1,
        );
        expect(info.supportedModes[0].tags).to.deep.equal([]);
    });
});

describe("decodeChangeToModeResult", () => {
    it("decodes a successful response without a status text", () => {
        const result = decodeChangeToModeResult({ "0": 0 });
        expect(result).to.deep.equal({ success: true, status: 0, statusName: "Success", statusText: undefined });
    });

    it("decodes a rejected response with its status text", () => {
        const result = decodeChangeToModeResult({ "0": 1, "1": "Mode is not currently available" });
        expect(result.success).to.equal(false);
        expect(result.statusName).to.equal("UnsupportedMode");
        expect(result.statusText).to.equal("Mode is not currently available");
    });

    it("names an unrecognized status code", () => {
        const result = decodeChangeToModeResult({ "0": 9 });
        expect(result.statusName).to.equal("Unknown (9)");
    });

    it("treats a missing status as Success", () => {
        const result = decodeChangeToModeResult({});
        expect(result.status).to.equal(0);
        expect(result.success).to.equal(true);
    });
});
