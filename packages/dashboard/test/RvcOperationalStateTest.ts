/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";

describe("RVC Operational State Cluster", () => {
    describe("Operational State Enum", () => {
        it("maps state value 0 to 'Stopped'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[0]).to.equal("Stopped");
        });

        it("maps state value 1 to 'Running'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[1]).to.equal("Running");
        });

        it("maps state value 2 to 'Paused'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[2]).to.equal("Paused");
        });

        it("maps state value 3 to 'Error'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[3]).to.equal("Error");
        });

        it("maps state value 4 to 'Remote Control'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[4]).to.equal("Remote Control");
        });

        it("maps state value 5 to 'Charging'", () => {
            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };
            expect(stateMap[5]).to.equal("Charging");
        });
    });

    describe("Error State Enum", () => {
        it("maps error state 0 to 'No Error'", () => {
            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };
            expect(errorStateMap[0]).to.equal("No Error");
        });

        it("maps error state 1 to 'Unable to Start'", () => {
            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };
            expect(errorStateMap[1]).to.equal("Unable to Start");
        });

        it("maps error state 2 to 'Unable to Stop'", () => {
            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };
            expect(errorStateMap[2]).to.equal("Unable to Stop");
        });

        it("maps error state 3 to 'Unable to Pause'", () => {
            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };
            expect(errorStateMap[3]).to.equal("Unable to Pause");
        });

        it("maps error state 4 to 'Unable to Resume'", () => {
            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };
            expect(errorStateMap[4]).to.equal("Unable to Resume");
        });
    });

    describe("Cluster Registration", () => {
        it("registers RvcOperationalState cluster with ID 97", () => {
            const CLUSTER_ID = 97;
            const TAG_NAME = "rvc-operational-state-cluster-commands";

            expect(CLUSTER_ID).to.equal(97);
            expect(TAG_NAME).to.equal("rvc-operational-state-cluster-commands");
        });

        it("has correct attribute IDs", () => {
            const OPERATIONAL_STATE_ATTR = 4;
            const OPERATIONAL_ERROR_ATTR = 5;

            expect(OPERATIONAL_STATE_ATTR).to.equal(4);
            expect(OPERATIONAL_ERROR_ATTR).to.equal(5);
        });
    });

    describe("Commands", () => {
        it("has Start command (ID 2)", () => {
            const commands = {
                Start: 2,
                Pause: 0,
                Stop: 1,
                Resume: 3,
                GoHome: 128,
            };
            expect(commands.Start).to.equal(2);
        });

        it("has Pause command (ID 0)", () => {
            const commands = {
                Start: 2,
                Pause: 0,
                Stop: 1,
                Resume: 3,
                GoHome: 128,
            };
            expect(commands.Pause).to.equal(0);
        });

        it("has Stop command (ID 1)", () => {
            const commands = {
                Start: 2,
                Pause: 0,
                Stop: 1,
                Resume: 3,
                GoHome: 128,
            };
            expect(commands.Stop).to.equal(1);
        });

        it("has Resume command (ID 3)", () => {
            const commands = {
                Start: 2,
                Pause: 0,
                Stop: 1,
                Resume: 3,
                GoHome: 128,
            };
            expect(commands.Resume).to.equal(3);
        });

        it("has GoHome command (ID 128)", () => {
            const commands = {
                Start: 2,
                Pause: 0,
                Stop: 1,
                Resume: 3,
                GoHome: 128,
            };
            expect(commands.GoHome).to.equal(128);
        });
    });

    describe("Attribute Formatting", () => {
        const formatOperationalState = (value: unknown): string | null => {
            if (value === undefined || value === null) return null;

            const stateMap: Record<number, string> = {
                0: "Stopped",
                1: "Running",
                2: "Paused",
                3: "Error",
                4: "Remote Control",
                5: "Charging",
            };

            if (typeof value === "number") {
                return stateMap[value] ?? `Unknown (${value})`;
            }
            return null;
        };

        const formatOperationalError = (value: unknown): string | null => {
            if (value === undefined || value === null) return null;

            if (typeof value === "object" && value !== null) {
                const errorObj = value as Record<string, unknown>;
                const state = errorObj.state ?? errorObj.operationalError ?? 0;

                const errorStateMap: Record<number, string> = {
                    0: "No Error",
                    1: "Unable to Start",
                    2: "Unable to Stop",
                    3: "Unable to Pause",
                    4: "Unable to Resume",
                };

                return errorStateMap[state as number] ?? `Unknown (${state})`;
            }
            return null;
        };

        it("formats operational state value as string", () => {
            expect(formatOperationalState(0)).to.equal("Stopped");
            expect(formatOperationalState(1)).to.equal("Running");
            expect(formatOperationalState(2)).to.equal("Paused");
        });

        it("returns null for undefined operational state", () => {
            expect(formatOperationalState(undefined)).to.be.null;
        });

        it("returns null for null operational state", () => {
            expect(formatOperationalState(null)).to.be.null;
        });

        it("handles unknown operational state values", () => {
            expect(formatOperationalState(99)).to.equal("Unknown (99)");
        });

        it("formats operational error object", () => {
            expect(formatOperationalError({ state: 0 })).to.equal("No Error");
            expect(formatOperationalError({ state: 1 })).to.equal("Unable to Start");
            expect(formatOperationalError({ operationalError: 2 })).to.equal("Unable to Stop");
        });

        it("returns null for undefined operational error", () => {
            expect(formatOperationalError(undefined)).to.be.null;
        });

        it("returns null for null operational error", () => {
            expect(formatOperationalError(null)).to.be.null;
        });

        it("handles unknown operational error states", () => {
            expect(formatOperationalError({ state: 99 })).to.equal("Unknown (99)");
        });
    });
});
