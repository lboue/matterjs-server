/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { redactSensitiveCommandFields } from "../src/logging-redaction.js";

describe("redactSensitiveCommandFields", () => {
    it("redacts credentialData in a device_command SetCredential payload", () => {
        const message = {
            message_id: "1",
            command: "device_command",
            args: { payload: { credentialData: "MTIzNA==", credential: { credentialType: 1, credentialIndex: 3 } } },
        };
        const redacted = redactSensitiveCommandFields(message);
        expect(redacted.args.payload.credentialData).to.equal("[redacted]");
        expect(redacted.args.payload.credential).to.deep.equal({ credentialType: 1, credentialIndex: 3 });
    });

    it("redacts pinCode in a LockDoor/UnlockDoor payload", () => {
        const message = { message_id: "1", command: "device_command", args: { payload: { pinCode: "MTIzNA==" } } };
        const redacted = redactSensitiveCommandFields(message);
        expect(redacted.args.payload.pinCode).to.equal("[redacted]");
    });

    it("leaves the original message untouched", () => {
        const message = { message_id: "1", command: "device_command", args: { payload: { pinCode: "MTIzNA==" } } };
        redactSensitiveCommandFields(message);
        expect(message.args.payload.pinCode).to.equal("MTIzNA==");
    });

    it("returns the same message when there is nothing sensitive to redact", () => {
        const message = { message_id: "1", command: "get_nodes", args: undefined };
        expect(redactSensitiveCommandFields(message)).to.equal(message);

        const withPayload = { message_id: "1", command: "device_command", args: { payload: { userIndex: 3 } } };
        expect(redactSensitiveCommandFields(withPayload)).to.equal(withPayload);
    });
});
