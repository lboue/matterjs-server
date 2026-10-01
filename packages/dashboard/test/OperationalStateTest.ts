/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    decodeAcceptedCommands,
    decodeOperationalCommandResponse,
    decodeOperationalError,
    describeOperationalState,
    ErrorState,
    errorStateLabel,
    OperationalCommand,
    OperationalState,
    operationalStateLabel,
} from "../src/util/operational-state.js";

describe("Operational State", () => {
    describe("describeOperationalState", () => {
        it("maps the base states to their spec labels", () => {
            expect(describeOperationalState(OperationalState.Stopped)).to.equal("Stopped");
            expect(describeOperationalState(OperationalState.Running)).to.equal("Running");
            expect(describeOperationalState(OperationalState.Paused)).to.equal("Paused");
            expect(describeOperationalState(OperationalState.Error)).to.equal("Error");
        });

        it("returns null for an absent attribute", () => {
            expect(describeOperationalState(undefined)).to.be.null;
            expect(describeOperationalState(null)).to.be.null;
        });

        it("labels vendor-specific and unknown numeric states instead of dropping them", () => {
            expect(describeOperationalState(64)).to.equal("Unknown (64)");
            expect(describeOperationalState(99)).to.equal("Unknown (99)");
        });

        it("uses the OperationalStateList label for a manufacturer-specific id", () => {
            const stateList = [{ "0": 128, "1": "Mopping" }];
            expect(describeOperationalState(128, stateList)).to.equal("Mopping");
        });

        it("prefers the base enum name over a list entry for a base id", () => {
            const stateList = [{ "0": OperationalState.Running, "1": "Spinning" }];
            expect(describeOperationalState(OperationalState.Running, stateList)).to.equal("Running");
        });

        it("still labels a manufacturer id as unknown when the list omits it", () => {
            expect(describeOperationalState(128, [{ "0": 129, "1": "Other" }])).to.equal("Unknown (128)");
        });
    });

    describe("errorStateLabel", () => {
        it("maps the base error ids to their labels", () => {
            expect(errorStateLabel(ErrorState.NoError)).to.equal("No Error");
            expect(errorStateLabel(ErrorState.UnableToStartOrResume)).to.equal("Unable to Start or Resume");
            expect(errorStateLabel(ErrorState.UnableToCompleteOperation)).to.equal("Unable to Complete Operation");
            expect(errorStateLabel(ErrorState.CommandInvalidInState)).to.equal("Command Invalid in Current State");
        });

        it("labels unknown error ids", () => {
            expect(errorStateLabel(200)).to.equal("Unknown (200)");
        });

        it("uses the device-supplied label for a manufacturer-specific id", () => {
            expect(errorStateLabel(128, "Bin Jammed")).to.equal("Bin Jammed");
        });

        it("prefers the base enum name over a device label for a base id", () => {
            expect(errorStateLabel(ErrorState.NoError, "Something")).to.equal("No Error");
        });
    });

    describe("decodeOperationalError", () => {
        it("reads the ErrorStateStruct from its field-tag-keyed wire shape", () => {
            const decoded = decodeOperationalError({ "0": ErrorState.UnableToCompleteOperation, "2": "jammed" });
            expect(decoded).to.not.be.null;
            expect(decoded?.errorStateId).to.equal(ErrorState.UnableToCompleteOperation);
            expect(decoded?.isError).to.be.true;
            expect(decoded?.label).to.equal("Unable to Complete Operation");
            expect(decoded?.details).to.equal("jammed");
        });

        it("does not flag NoError as an error", () => {
            const decoded = decodeOperationalError({ "0": ErrorState.NoError });
            expect(decoded?.errorStateId).to.equal(0);
            expect(decoded?.isError).to.be.false;
            expect(decoded?.label).to.equal("No Error");
        });

        it("reads the ErrorStateLabel (tag 1) for a manufacturer-specific id", () => {
            const decoded = decodeOperationalError({ "0": 128, "1": "Bin Jammed", "2": "front bin" });
            expect(decoded?.errorStateId).to.equal(128);
            expect(decoded?.isError).to.be.true;
            expect(decoded?.label).to.equal("Bin Jammed");
            expect(decoded?.details).to.equal("front bin");
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
                    errorStateDetails: "already running",
                },
            });
            expect(outcome?.isError).to.be.true;
            expect(outcome?.errorStateId).to.equal(ErrorState.CommandInvalidInState);
            expect(outcome?.label).to.equal("Command Invalid in Current State");
            expect(outcome?.details).to.equal("already running");
        });

        it("keeps the errorStateLabel for a manufacturer-specific rejection", () => {
            const outcome = decodeOperationalCommandResponse({
                commandResponseState: { errorStateId: 130, errorStateLabel: "Lid Open" },
            });
            expect(outcome?.isError).to.be.true;
            expect(outcome?.errorStateId).to.equal(130);
            expect(outcome?.label).to.equal("Lid Open");
        });

        it("returns null when the response carries no commandResponseState", () => {
            expect(decodeOperationalCommandResponse(undefined)).to.be.null;
            expect(decodeOperationalCommandResponse({})).to.be.null;
        });
    });

    describe("decodeAcceptedCommands", () => {
        it("collects the advertised command ids into a set", () => {
            const ids = decodeAcceptedCommands([OperationalCommand.Pause, OperationalCommand.Resume]);
            expect(ids.has(OperationalCommand.Pause)).to.be.true;
            expect(ids.has(OperationalCommand.Resume)).to.be.true;
            expect(ids.has(OperationalCommand.Start)).to.be.false;
        });

        it("yields an empty set when the attribute is absent or malformed, so no command is offered", () => {
            expect(decodeAcceptedCommands(undefined).size).to.equal(0);
            expect(decodeAcceptedCommands(null).size).to.equal(0);
            expect(decodeAcceptedCommands("nope").size).to.equal(0);
        });
    });

    describe("operationalStateLabel", () => {
        it("labels the base states", () => {
            expect(operationalStateLabel(OperationalState.Stopped)).to.equal("Stopped");
            expect(operationalStateLabel(OperationalState.Running)).to.equal("Running");
        });
    });
});
