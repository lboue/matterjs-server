/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { waterHeaterManagementInfo } from "../src/util/water-heater-management.js";

const BASE_ATTRS: Record<string, unknown> = {
    "1/148/0": 0b0001, // HeaterTypes: Immersion Element 1
    "1/148/1": 0b0000, // HeatDemand: None currently
    "1/148/4": 85, // TankPercentage: 85%
    "1/148/5": 0, // BoostState: Inactive
    "1/148/65532": 0b11, // FeatureMap: EnergyManagement (bit 0) + TankPercent (bit 1)
};

describe("water heater management util", () => {
    it("reports unsupported when the cluster is absent", () => {
        const info = waterHeaterManagementInfo({ "1/40/5": "label" }, 1);
        expect(info.supported).to.equal(false);
    });

    it("decodes heater types bitmap", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.supported).to.equal(true);
        expect(info.heaterTypesBitmap).to.equal(0b0001);
        expect(info.heaterTypes).to.deep.equal(["Immersion Element 1"]);
    });

    it("decodes heat demand bitmap", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.heatDemandBitmap).to.equal(0b0000);
        expect(info.heatDemandTypes).to.deep.equal([]);

        const withDemandAttrs = { ...BASE_ATTRS, "1/148/1": 0b0101 };
        const demandInfo = waterHeaterManagementInfo(withDemandAttrs, 1);
        expect(demandInfo.heatDemandTypes).to.deep.equal(["Immersion Element 1", "Heat Pump"]);
    });

    it("decodes tank percentage", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.tankPercentage).to.equal(85);
    });

    it("decodes boost state enum", () => {
        const inactiveInfo = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(inactiveInfo.boostStateValue).to.equal(0);
        expect(inactiveInfo.boostState).to.equal("Inactive");
        expect(inactiveInfo.boostActive).to.equal(false);

        const activeAttrs = { ...BASE_ATTRS, "1/148/5": 1 };
        const activeInfo = waterHeaterManagementInfo(activeAttrs, 1);
        expect(activeInfo.boostStateValue).to.equal(1);
        expect(activeInfo.boostState).to.equal("Active");
        expect(activeInfo.boostActive).to.equal(true);
    });

    it("detects supported features from FeatureMap", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.supportsEnergyManagement).to.equal(true);
        expect(info.supportsTankPercent).to.equal(true);

        const noFeaturesAttrs = { ...BASE_ATTRS, "1/148/65532": 0 };
        const noFeaturesInfo = waterHeaterManagementInfo(noFeaturesAttrs, 1);
        expect(noFeaturesInfo.supportsEnergyManagement).to.equal(false);
        expect(noFeaturesInfo.supportsTankPercent).to.equal(false);
    });

    it("handles missing optional attributes gracefully", () => {
        const minimalAttrs: Record<string, unknown> = {
            "1/148/0": 0b0001, // Only heater types
        };
        const info = waterHeaterManagementInfo(minimalAttrs, 1);
        expect(info.supported).to.equal(true);
        expect(info.heaterTypes).to.deep.equal(["Immersion Element 1"]);
        expect(info.tankPercentage).to.equal(undefined);
        expect(info.boostState).to.equal(undefined);
    });

    it("handles all heater type bits", () => {
        const heaterTypes = [
            { value: 0b00001, name: "Immersion Element 1" },
            { value: 0b00010, name: "Immersion Element 2" },
            { value: 0b00100, name: "Heat Pump" },
            { value: 0b01000, name: "Boiler" },
            { value: 0b10000, name: "Other" },
        ];

        heaterTypes.forEach(({ value, name }) => {
            const attrs = { ...BASE_ATTRS, "1/148/0": value };
            const info = waterHeaterManagementInfo(attrs, 1);
            expect(info.heaterTypes).to.deep.equal([name]);
        });
    });

    it("handles combined heater type bits", () => {
        const attrs = { ...BASE_ATTRS, "1/148/0": 0b00101 }; // Immersion 1 + Heat Pump
        const info = waterHeaterManagementInfo(attrs, 1);
        expect(info.heaterTypes).to.deep.equal(["Immersion Element 1", "Heat Pump"]);
    });

    it("works with different endpoints", () => {
        const attrs2: Record<string, unknown> = {
            "2/148/0": 0b0100, // Endpoint 2, Heat Pump
            "2/148/5": 1, // Boost active
        };
        const info = waterHeaterManagementInfo(attrs2, 2);
        expect(info.heaterTypes).to.deep.equal(["Heat Pump"]);
        expect(info.boostActive).to.equal(true);
    });
});
