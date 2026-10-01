/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    decodeOperationalCommandResponse,
    decodeOperationalError,
    describeOperationalState,
    ErrorState,
    errorStateLabel,
    OperationalState,
    operationalStateLabel,
} from "../src/util/rvc-operational-state.js";

describe("RVC Operational State", () => {
    describe("describeOperationalState", () => {
        it("maps the base and RVC-specific states to their spec labels", () => {
            expect(describeOperationalState(OperationalState.Stopped)).to.equal("Stopped");
            expect(describeOperationalState(OperationalState.Running)).to.equal("Running");
            expect(describeOperationalState(OperationalState.Paused)).to.equal("Paused");
            expect(describeOperationalState(OperationalState.Error)).to.equal("Error");
            expect(describeOperationalState(OperationalState.SeekingCharger)).to.equal("Seeking Charger");
            expect(describeOperationalState(OperationalState.Charging)).to.equal("Charging");
            expect(describeOperationalState(OperationalState.Docked)).to.equal("Docked");
        });

        it("uses the RVC enum values 64/65/66 for the charging states", () => {
            expect(operationalStateLabel(64)).to.equal("Seeking Charger");
            expect(operationalStateLabel(65)).to.equal("Charging");
            expect(operationalStateLabel(66)).to.equal("Docked");
        });

        it("returns null for an absent attribute", () => {
            expect(describeOperationalState(undefined)).to.be.null;
            expect(describeOperationalState(null)).to.be.null;
        });

        it("labels unknown numeric states instead of dropping them", () => {
            expect(describeOperationalState(99)).to.equal("Unknown (99)");
        });
    });

    describe("errorStateLabel", () => {
        it("maps the spec error ids to their labels", () => {
            expect(errorStateLabel(ErrorState.NoError)).to.equal("No Error");
            expect(errorStateLabel(ErrorState.UnableToStartOrResume)).to.equal("Unable to Start or Resume");
            expect(errorStateLabel(ErrorState.UnableToCompleteOperation)).to.equal("Unable to Complete Operation");
            expect(errorStateLabel(ErrorState.CommandInvalidInState)).to.equal("Command Invalid in Current State");
            expect(errorStateLabel(ErrorState.Stuck)).to.equal("Stuck");
            expect(errorStateLabel(ErrorState.DustBinFull)).to.equal("Dust Bin Full");
        });

        it("labels unknown error ids", () => {
            expect(errorStateLabel(200)).to.equal("Unknown (200)");
        });
    });

    describe("decodeOperationalError", () => {
        it("reads the ErrorStateStruct from its field-tag-keyed wire shape", () => {
            const decoded = decodeOperationalError({ "0": ErrorState.Stuck, "2": "left wheel blocked" });
            expect(decoded).to.not.be.null;
            expect(decoded?.errorStateId).to.equal(ErrorState.Stuck);
            expect(decoded?.isError).to.be.true;
            expect(decoded?.label).to.equal("Stuck");
            expect(decoded?.details).to.equal("left wheel blocked");
        });

        it("does not flag NoError as an error", () => {
            const decoded = decodeOperationalError({ "0": ErrorState.NoError });
            expect(decoded?.errorStateId).to.equal(0);
            expect(decoded?.isError).to.be.false;
            expect(decoded?.label).to.equal("No Error");
        });

        it("returns null when the attribute is absent or malformed", () => {
            expect(decodeOperationalError(undefined)).to.be.null;
            expect(decodeOperationalError(null)).to.be.null;
            expect(decodeOperationalError({})).to.be.null;
        });
    });

    describe("decodeOperationalCommandResponse", () => {
        it("reports success when commandResponseState is NoError", () => {
            const outcome = decodeOperationalCommandResponse({
                commandResponseState: { errorStateId: ErrorState.NoError },
            });
            expect(outcome?.isError).to.be.false;
            expect(outcome?.label).to.equal("No Error");
        });

        it("surfaces a rejected command whose invoke otherwise succeeded", () => {
            const outcome = decodeOperationalCommandResponse({
                commandResponseState: {
                    errorStateId: ErrorState.CommandInvalidInState,
                    errorStateDetails: "already docked",
                },
            });
            expect(outcome?.isError).to.be.true;
            expect(outcome?.errorStateId).to.equal(ErrorState.CommandInvalidInState);
            expect(outcome?.label).to.equal("Command Invalid in Current State");
            expect(outcome?.details).to.equal("already docked");
        });

        it("returns null when the response carries no commandResponseState", () => {
            expect(decodeOperationalCommandResponse(undefined)).to.be.null;
            expect(decodeOperationalCommandResponse({})).to.be.null;
        });
    });
});
