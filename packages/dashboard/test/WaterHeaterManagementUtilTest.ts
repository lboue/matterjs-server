/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { waterHeaterManagementInfo } from "../src/util/water-heater-management.js";

const BASE_ATTRS: Record<string, unknown> = {
    "1/157/0": 5000, // HeatingSetpoint: 50°C (in 0.01°C)
    "1/157/1": 6500, // MaxHeatingSetpoint: 65°C
    "1/157/2": 2000, // MinHeatingSetpoint: 20°C
    "1/157/3": 4500, // ReheatSetpoint: 45°C
    "1/157/4": 6000, // MaxReheatSetpoint: 60°C
    "1/157/5": 3000, // MinReheatSetpoint: 30°C
    "1/157/6": 1, // Mode: Heat pump only
    "1/157/7": 1, // State: Heating
    "1/157/65532": 0b11, // FeatureMap: Boost (bit 0) + Reheat (bit 1)
};

describe("water heater management util", () => {
    it("reports unsupported when the cluster is absent", () => {
        const info = waterHeaterManagementInfo({ "1/40/5": "label" }, 1);
        expect(info.supported).to.equal(false);
    });

    it("decodes heating setpoint and temperature range", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.supported).to.equal(true);
        expect(info.heatingSetpointC).to.equal(50);
        expect(info.maxHeatingSetpointC).to.equal(65);
        expect(info.minHeatingSetpointC).to.equal(20);
    });

    it("decodes reheat setpoint and temperature range", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.reheatSetpointC).to.equal(45);
        expect(info.maxReheatSetpointC).to.equal(60);
        expect(info.minReheatSetpointC).to.equal(30);
    });

    it("decodes mode enum", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.modeValue).to.equal(1);
        expect(info.mode).to.equal("Heat pump only");
    });

    it("handles unknown mode value", () => {
        const attrs = { ...BASE_ATTRS, "1/157/6": 99 };
        const info = waterHeaterManagementInfo(attrs, 1);
        expect(info.mode).to.equal("Unknown (99)");
    });

    it("decodes state enum and boost status", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.stateValue).to.equal(1);
        expect(info.state).to.equal("Heating");
        expect(info.boostActive).to.equal(false);

        const boostAttrs = { ...BASE_ATTRS, "1/157/7": 2 };
        const boostInfo = waterHeaterManagementInfo(boostAttrs, 1);
        expect(boostInfo.state).to.equal("Boost active");
        expect(boostInfo.boostActive).to.equal(true);
    });

    it("detects supported features from FeatureMap", () => {
        const info = waterHeaterManagementInfo(BASE_ATTRS, 1);
        expect(info.supportsBoost).to.equal(true);
        expect(info.supportsReheat).to.equal(true);

        const noFeaturesAttrs = { ...BASE_ATTRS, "1/157/65532": 0 };
        const noFeaturesInfo = waterHeaterManagementInfo(noFeaturesAttrs, 1);
        expect(noFeaturesInfo.supportsBoost).to.equal(false);
        expect(noFeaturesInfo.supportsReheat).to.equal(false);
    });

    it("handles missing attributes gracefully", () => {
        const sparseAttrs: Record<string, unknown> = {
            "1/157/0": 5000, // Only heating setpoint
        };
        const info = waterHeaterManagementInfo(sparseAttrs, 1);
        expect(info.supported).to.equal(true);
        expect(info.heatingSetpointC).to.equal(50);
        expect(info.mode).to.equal(undefined);
        expect(info.state).to.equal(undefined);
        expect(info.supportsBoost).to.equal(undefined);
    });

    it("handles all state values", () => {
        const states = [
            { value: 0, name: "Idle" },
            { value: 1, name: "Heating" },
            { value: 2, name: "Boost active" },
            { value: 3, name: "Fault" },
        ];

        states.forEach(({ value, name }) => {
            const attrs = { ...BASE_ATTRS, "1/157/7": value };
            const info = waterHeaterManagementInfo(attrs, 1);
            expect(info.state).to.equal(name);
        });
    });

    it("handles all mode values", () => {
        const modes = [
            { value: 0, name: "Off" },
            { value: 1, name: "Heat pump only" },
            { value: 2, name: "Resistive heating" },
            { value: 3, name: "Heat pump and resistive" },
        ];

        modes.forEach(({ value, name }) => {
            const attrs = { ...BASE_ATTRS, "1/157/6": value };
            const info = waterHeaterManagementInfo(attrs, 1);
            expect(info.mode).to.equal(name);
        });
    });

    it("works with different endpoints", () => {
        const attrs2: Record<string, unknown> = {
            "2/157/0": 4000, // Endpoint 2 instead of 1
            "2/157/6": 1,
            "2/157/7": 0,
        };
        const info = waterHeaterManagementInfo(attrs2, 2);
        expect(info.heatingSetpointC).to.equal(40);
        expect(info.mode).to.equal("Heat pump only");
    });
});
