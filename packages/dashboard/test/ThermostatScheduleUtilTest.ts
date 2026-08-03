/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterNode, type MatterNodeData } from "@matter-server/ws-client";
import {
    assignDaysToSchedules,
    buildDaySegments,
    computeSetpointRange,
    DAY_LABELS,
    type DaySegment,
    formatHandleShort,
    formatMinutes,
    formatSegmentTooltip,
    formatSetpoint,
    isMSCHActive,
    pickSetpointForMode,
    readActiveScheduleHandle,
    readPresets,
    readSchedules,
    resolveTransitionLabel,
    setpointColorMixPercent,
    type ThermostatSchedule,
} from "../src/util/thermostat-schedule.js";

function node(attributes: Record<string, unknown>, node_id: number | bigint = 1): MatterNode {
    const data: MatterNodeData = {
        node_id,
        date_commissioned: "",
        last_interview: "",
        interview_version: 1,
        available: true,
        is_bridge: false,
        attributes,
        attribute_subscriptions: [],
    };
    return new MatterNode(data);
}

// Single-byte schedule handles, base64-encoded (0x01 -> "AQ==", 0x02 -> "Ag==").
const HANDLE_1 = "AQ==";
const HANDLE_2 = "Ag==";

describe("thermostat-schedule util", () => {
    describe("isMSCHActive", () => {
        it("is true when the MSCH bit is set on the real Thermostat FeatureMap", () => {
            expect(isMSCHActive(node({ "6/513/65532": 1 << 7 }), 6)).to.equal(true);
        });
        it("is false when MSCH is not set", () => {
            expect(isMSCHActive(node({ "6/513/65532": 0b1 }), 6)).to.equal(false);
        });
        it("is false when FeatureMap is absent", () => {
            expect(isMSCHActive(node({}), 6)).to.equal(false);
        });
    });

    describe("readActiveScheduleHandle", () => {
        it("reads the handle string", () => {
            expect(readActiveScheduleHandle(node({ "6/513/79": HANDLE_1 }), 6)).to.equal(HANDLE_1);
        });
        it("returns null when null/absent", () => {
            expect(readActiveScheduleHandle(node({ "6/513/79": null }), 6)).to.equal(null);
            expect(readActiveScheduleHandle(node({}), 6)).to.equal(null);
        });
    });

    describe("readSchedules", () => {
        it("decodes named-keyed struct fields, including nested transitions", () => {
            const schedules = readSchedules(
                node({
                    "6/513/81": [
                        {
                            ScheduleHandle: HANDLE_1,
                            SystemMode: 4,
                            Name: "Weekdays",
                            Transitions: [{ DayOfWeek: 0b0111110, TransitionTime: 480, HeatingSetpoint: 2100 }],
                        },
                    ],
                }),
                6,
            );
            expect(schedules).to.deep.equal([
                {
                    handle: HANDLE_1,
                    systemMode: 4,
                    name: "Weekdays",
                    presetHandle: null,
                    builtIn: null,
                    transitions: [
                        {
                            dayOfWeek: 0b0111110,
                            transitionTimeMin: 480,
                            presetHandle: null,
                            systemMode: null,
                            coolingSetpoint: null,
                            heatingSetpoint: 2100,
                        },
                    ],
                },
            ]);
        });
        it("decodes field-tag-keyed wire entries", () => {
            const schedules = readSchedules(
                node({
                    "6/513/81": [
                        {
                            "0": HANDLE_2,
                            "1": 4,
                            "4": [{ "0": 0b1000001, "1": 0, "5": 1750 }],
                        },
                    ],
                }),
                6,
            );
            expect(schedules[0].handle).to.equal(HANDLE_2);
            expect(schedules[0].transitions[0]).to.deep.equal({
                dayOfWeek: 0b1000001,
                transitionTimeMin: 0,
                presetHandle: null,
                systemMode: null,
                coolingSetpoint: null,
                heatingSetpoint: 1750,
            });
        });
        it("drops entries missing a required field and returns empty for a non-array attribute", () => {
            expect(readSchedules(node({ "6/513/81": [{ Name: "no mode or handle" }] }), 6)).to.deep.equal([]);
            expect(readSchedules(node({}), 6)).to.deep.equal([]);
        });
    });

    describe("readPresets", () => {
        it("decodes named- and tag-keyed presets", () => {
            const presets = readPresets(
                node({
                    "6/513/80": [
                        { PresetHandle: HANDLE_1, PresetScenario: 4, Name: "Night" },
                        { "0": HANDLE_2, "1": 4, "2": "Morning" },
                    ],
                }),
                6,
            );
            expect(presets).to.deep.equal([
                { handle: HANDLE_1, name: "Night" },
                { handle: HANDLE_2, name: "Morning" },
            ]);
        });
        it("returns empty when absent", () => {
            expect(readPresets(node({}), 6)).to.deep.equal([]);
        });
    });

    describe("resolveTransitionLabel", () => {
        const presets = [{ handle: HANDLE_1, name: "Night" }];
        it("prefers a matching preset name", () => {
            const label = resolveTransitionLabel({ presetHandle: HANDLE_1, systemMode: 4 }, presets);
            expect(label).to.equal("Night");
        });
        it("falls back to the SystemMode label when no preset matches", () => {
            const label = resolveTransitionLabel({ presetHandle: null, systemMode: 4 }, presets);
            expect(label).to.equal("Heat");
        });
        it("falls back to a generic label when neither is available", () => {
            const label = resolveTransitionLabel({ presetHandle: null, systemMode: null }, presets);
            expect(label).to.equal("Setpoint");
        });
    });

    describe("assignDaysToSchedules", () => {
        it("assigns Mon-Fri to Weekdays and Sat-Sun to Weekend", () => {
            const weekdays: ThermostatSchedule = {
                handle: HANDLE_1,
                systemMode: 4,
                name: "Weekdays",
                presetHandle: null,
                builtIn: null,
                transitions: [
                    {
                        dayOfWeek: 0b0111110, // Mon..Fri
                        transitionTimeMin: 0,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: 1750,
                    },
                ],
            };
            const weekend: ThermostatSchedule = {
                handle: HANDLE_2,
                systemMode: 4,
                name: "Weekend",
                presetHandle: null,
                builtIn: null,
                transitions: [
                    {
                        dayOfWeek: 0b1000001, // Sat + Sun
                        transitionTimeMin: 0,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: 1750,
                    },
                ],
            };
            const owners = assignDaysToSchedules([weekdays, weekend]);
            expect(owners.map(s => s?.name)).to.deep.equal(
                DAY_LABELS.map(d => (d === "Sat" || d === "Sun" ? "Weekend" : "Weekdays")),
            );
        });
        it("leaves a day unowned when no schedule claims it", () => {
            const owners = assignDaysToSchedules([]);
            expect(owners).to.deep.equal(new Array(7).fill(undefined));
        });
    });

    describe("buildDaySegments", () => {
        it("returns no segments when the schedule has no transitions for that day", () => {
            const schedule: ThermostatSchedule = {
                handle: null,
                systemMode: 4,
                name: null,
                presetHandle: null,
                builtIn: null,
                transitions: [],
            };
            expect(buildDaySegments(schedule, 0)).to.deep.equal([]);
        });
        it("carries the last transition's setpoint into the wraparound segment before the first transition", () => {
            const schedule: ThermostatSchedule = {
                handle: null,
                systemMode: 4,
                name: null,
                presetHandle: null,
                builtIn: null,
                transitions: [
                    // Monday = bit 1
                    {
                        dayOfWeek: 0b10,
                        transitionTimeMin: 480,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: 1800,
                    },
                    {
                        dayOfWeek: 0b10,
                        transitionTimeMin: 1320,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: 2100,
                    },
                ],
            };
            expect(buildDaySegments(schedule, 0)).to.deep.equal([
                {
                    startMin: 0,
                    endMin: 480,
                    heatingSetpoint: 2100,
                    coolingSetpoint: null,
                    presetHandle: null,
                    systemMode: null,
                },
                {
                    startMin: 480,
                    endMin: 1320,
                    heatingSetpoint: 1800,
                    coolingSetpoint: null,
                    presetHandle: null,
                    systemMode: null,
                },
                {
                    startMin: 1320,
                    endMin: 1440,
                    heatingSetpoint: 2100,
                    coolingSetpoint: null,
                    presetHandle: null,
                    systemMode: null,
                },
            ]);
        });
        it("skips the wraparound segment when the first transition is already at midnight", () => {
            const schedule: ThermostatSchedule = {
                handle: null,
                systemMode: 4,
                name: null,
                presetHandle: null,
                builtIn: null,
                transitions: [
                    {
                        dayOfWeek: 0b10,
                        transitionTimeMin: 0,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: 1750,
                    },
                ],
            };
            expect(buildDaySegments(schedule, 0)).to.deep.equal([
                {
                    startMin: 0,
                    endMin: 1440,
                    heatingSetpoint: 1750,
                    coolingSetpoint: null,
                    presetHandle: null,
                    systemMode: null,
                },
            ]);
        });
    });

    describe("formatSetpoint", () => {
        it("divides by 100 and appends the unit", () => {
            expect(formatSetpoint(1750)).to.equal("17.5°C");
            expect(formatSetpoint(2100)).to.equal("21.0°C");
        });
        it("returns undefined for null/undefined", () => {
            expect(formatSetpoint(null)).to.equal(undefined);
            expect(formatSetpoint(undefined)).to.equal(undefined);
        });
    });

    describe("computeSetpointRange", () => {
        const schedule: ThermostatSchedule = {
            handle: null,
            systemMode: 1,
            name: null,
            presetHandle: null,
            builtIn: null,
            transitions: [
                {
                    dayOfWeek: 0,
                    transitionTimeMin: 0,
                    presetHandle: null,
                    systemMode: null,
                    coolingSetpoint: 2600,
                    heatingSetpoint: 1750,
                },
                {
                    dayOfWeek: 0,
                    transitionTimeMin: 480,
                    presetHandle: null,
                    systemMode: null,
                    coolingSetpoint: null,
                    heatingSetpoint: 2100,
                },
            ],
        };
        it("scopes the range to heating setpoints in heat mode", () => {
            expect(computeSetpointRange(schedule, "heat")).to.deep.equal({ min: 1750, max: 2100 });
        });
        it("scopes the range to cooling setpoints in cool mode, falling back where cooling is absent", () => {
            expect(computeSetpointRange(schedule, "cool")).to.deep.equal({ min: 2100, max: 2600 });
        });
        it("returns undefined when no numeric setpoints exist", () => {
            const empty: ThermostatSchedule = {
                handle: null,
                systemMode: 0,
                name: null,
                presetHandle: null,
                builtIn: null,
                transitions: [
                    {
                        dayOfWeek: 0,
                        transitionTimeMin: 0,
                        presetHandle: null,
                        systemMode: null,
                        coolingSetpoint: null,
                        heatingSetpoint: null,
                    },
                ],
            };
            expect(computeSetpointRange(empty, "heat")).to.equal(undefined);
        });
    });

    describe("setpointColorMixPercent", () => {
        it("clamps to 0-100 within range", () => {
            expect(setpointColorMixPercent(1750, 1750, 2100)).to.equal(0);
            expect(setpointColorMixPercent(2100, 1750, 2100)).to.equal(100);
            expect(setpointColorMixPercent(1925, 1750, 2100)).to.be.closeTo(50, 0.01);
        });
        it("clamps values outside the range", () => {
            expect(setpointColorMixPercent(1000, 1750, 2100)).to.equal(0);
            expect(setpointColorMixPercent(3000, 1750, 2100)).to.equal(100);
        });
        it("returns 50 when min === max", () => {
            expect(setpointColorMixPercent(1750, 1750, 1750)).to.equal(50);
        });
    });

    describe("pickSetpointForMode", () => {
        const segment = (heatingSetpoint: number | null, coolingSetpoint: number | null): DaySegment => ({
            startMin: 0,
            endMin: 1440,
            heatingSetpoint,
            coolingSetpoint,
            presetHandle: null,
            systemMode: null,
        });

        it("picks the heating setpoint in heat mode", () => {
            expect(pickSetpointForMode(segment(2000, 2400), "heat")).to.equal(2000);
        });
        it("picks the cooling setpoint in cool mode", () => {
            expect(pickSetpointForMode(segment(2000, 2400), "cool")).to.equal(2400);
        });
        it("falls back to whichever setpoint is present when the selected mode's is absent", () => {
            expect(pickSetpointForMode(segment(null, 2400), "heat")).to.equal(2400);
            expect(pickSetpointForMode(segment(1750, null), "cool")).to.equal(1750);
        });
        it("returns null when neither is present", () => {
            expect(pickSetpointForMode(segment(null, null), "heat")).to.equal(null);
        });
    });

    describe("formatHandleShort", () => {
        it("formats a single-byte handle as hex", () => {
            expect(formatHandleShort(HANDLE_1)).to.equal("0x01");
            expect(formatHandleShort(HANDLE_2)).to.equal("0x02");
        });
        it("returns an empty string for null", () => {
            expect(formatHandleShort(null)).to.equal("");
        });
    });

    describe("formatMinutes", () => {
        it("formats minutes-since-midnight as HH:MM", () => {
            expect(formatMinutes(0)).to.equal("00:00");
            expect(formatMinutes(90)).to.equal("01:30");
            expect(formatMinutes(1439)).to.equal("23:59");
        });
    });

    describe("formatSegmentTooltip", () => {
        const segment = (heatingSetpoint: number | null, coolingSetpoint: number | null): DaySegment => ({
            startMin: 360,
            endMin: 480,
            heatingSetpoint,
            coolingSetpoint,
            presetHandle: null,
            systemMode: 4,
        });

        it("includes the time span, label, and both setpoints when both are present", () => {
            expect(formatSegmentTooltip(segment(1900, 2500), [])).to.equal(
                "06:00–08:00 · Heat\nHeat 19.0°C\nCool 25.0°C",
            );
        });
        it("omits the setpoint line for whichever mode is absent", () => {
            expect(formatSegmentTooltip(segment(1900, null), [])).to.equal("06:00–08:00 · Heat\nHeat 19.0°C");
        });
    });
});
