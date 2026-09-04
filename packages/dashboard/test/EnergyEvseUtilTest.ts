/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { energyEvseInfo } from "../src/util/energy-evse.js";

const FEATURE_V2X = 0b10000;
const FEATURE_SOC = 0b10;
const FEATURE_PNC = 0b100;

const BASE_ATTRS: Record<string, unknown> = {
    "1/153/0": 3, // State: PluggedInCharging
    "1/153/1": 1, // SupplyState: ChargingEnabled
    "1/153/2": 0, // FaultState: NoError
    "1/153/3": null, // ChargingEnabledUntil: no expiry
    "1/153/5": 32000, // CircuitCapacity mA
    "1/153/6": 6000, // MinimumChargeCurrent mA
    "1/153/7": 16000, // MaximumChargeCurrent mA
    "1/153/64": 42, // SessionId
    "1/153/65": 3661, // SessionDuration s
    "1/153/66": 12_345_678, // SessionEnergyCharged mWh
    "1/153/65532": 0, // FeatureMap
};

describe("energy evse util", () => {
    it("reports unsupported when the cluster is absent", () => {
        const info = energyEvseInfo({ "1/40/5": "label" }, 1);
        expect(info.supported).to.equal(false);
        expect(info.v2xSupported).to.equal(false);
    });

    it("decodes the status enums and current limits", () => {
        const info = energyEvseInfo(BASE_ATTRS, 1);
        expect(info.supported).to.equal(true);
        expect(info.state).to.equal("Plugged in, charging");
        expect(info.supplyState).to.equal("Charging enabled");
        expect(info.faultState).to.equal("No error");
        expect(info.faultActive).to.equal(false);
        expect(info.circuitCapacityA).to.equal(32);
        expect(info.minimumChargeCurrentA).to.equal(6);
        expect(info.maximumChargeCurrentA).to.equal(16);
    });

    it("flags an active fault", () => {
        const info = energyEvseInfo({ ...BASE_ATTRS, "1/153/2": 4 }, 1);
        expect(info.faultState).to.equal("Over current");
        expect(info.faultActive).to.equal(true);
    });

    it("names an unknown fault code", () => {
        const info = energyEvseInfo({ ...BASE_ATTRS, "1/153/2": 42 }, 1);
        expect(info.faultState).to.equal("Unknown (42)");
    });

    it("distinguishes a null (no expiry) charging window from one not yet reported", () => {
        const noExpiry = energyEvseInfo(BASE_ATTRS, 1);
        expect(noExpiry.chargingEnabledUntil).to.equal(null);

        const notReported = energyEvseInfo({ ...BASE_ATTRS, "1/153/3": undefined }, 1);
        expect(notReported.chargingEnabledUntil).to.equal(undefined);

        const expiring = energyEvseInfo({ ...BASE_ATTRS, "1/153/3": 946_684_900 }, 1);
        expect(expiring.chargingEnabledUntil).to.equal(946_684_900);
    });

    it("decodes an active session and converts mWh to kWh", () => {
        const info = energyEvseInfo(BASE_ATTRS, 1);
        expect(info.session?.id).to.equal(42);
        expect(info.session?.durationS).to.equal(3661);
        expect(info.session?.energyChargedKWh).to.equal(12.345678);
    });

    it("reports no session while SessionId is still null", () => {
        const info = energyEvseInfo({ ...BASE_ATTRS, "1/153/64": null }, 1);
        expect(info.session).to.equal(undefined);
    });

    it("gates V2X attributes on the V2X feature bit", () => {
        const withoutV2x = energyEvseInfo(BASE_ATTRS, 1);
        expect(withoutV2x.v2xSupported).to.equal(false);

        const withV2x = energyEvseInfo(
            { ...BASE_ATTRS, "1/153/65532": FEATURE_V2X, "1/153/4": null, "1/153/8": 20000 },
            1,
        );
        expect(withV2x.v2xSupported).to.equal(true);
        expect(withV2x.dischargingEnabledUntil).to.equal(null);
        expect(withV2x.maximumDischargeCurrentA).to.equal(20);
    });

    it("decodes charging preferences, distinguishing 'none scheduled' from a target value", () => {
        const noneScheduled = energyEvseInfo(
            { ...BASE_ATTRS, "1/153/35": null, "1/153/36": null, "1/153/37": null, "1/153/38": null },
            1,
        );
        expect(noneScheduled.nextChargeStartTime).to.equal(null);
        expect(noneScheduled.nextChargeRequiredEnergyKWh).to.equal(null);

        const scheduled = energyEvseInfo(
            { ...BASE_ATTRS, "1/153/35": 946_684_900, "1/153/37": 10_000_000, "1/153/38": 80 },
            1,
        );
        expect(scheduled.nextChargeStartTime).to.equal(946_684_900);
        expect(scheduled.nextChargeRequiredEnergyKWh).to.equal(10);
        expect(scheduled.nextChargeTargetSoC).to.equal(80);
    });

    it("gates SoC reporting attributes on the SOC feature bit", () => {
        const info = energyEvseInfo(
            { ...BASE_ATTRS, "1/153/65532": FEATURE_SOC, "1/153/48": 55, "1/153/49": 75_000_000 },
            1,
        );
        expect(info.soCReportingSupported).to.equal(true);
        expect(info.stateOfCharge).to.equal(55);
        expect(info.batteryCapacityKWh).to.equal(75);
    });

    it("gates the vehicle ID on the PlugAndCharge feature bit", () => {
        const info = energyEvseInfo({ ...BASE_ATTRS, "1/153/65532": FEATURE_PNC, "1/153/50": "EMAID-123" }, 1);
        expect(info.plugAndChargeSupported).to.equal(true);
        expect(info.vehicleId).to.equal("EMAID-123");
    });
});
