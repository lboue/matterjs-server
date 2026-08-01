/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterNode, type MatterClient, type MatterNodeData } from "@matter-server/ws-client";
import { deleteAclEntry } from "../src/components/dialogs/acl/acl-actions.js";
import { addBinding, deleteBindingAtIndex } from "../src/components/dialogs/binding/binding-actions.js";

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

interface Writes {
    acl: number;
    binding: number;
}

/** A read that answers only the paths in `res` — a per-path failure shows up as an omitted path. */
function clientReading(res: Record<string, unknown>): { client: MatterClient; writes: Writes } {
    const writes: Writes = { acl: 0, binding: 0 };
    const client = {
        nodes: {},
        readAttribute: async () => res,
        setACLEntry: async () => {
            writes.acl++;
        },
        setNodeBinding: async () => {
            writes.binding++;
        },
    } as unknown as MatterClient;
    return { client, writes };
}

describe("fabric-scoped write paths", () => {
    it("deleteAclEntry refuses to write when the ACL read returned no list", async () => {
        const { client, writes } = clientReading({ "0/62/5": 1 });
        await expect(deleteAclEntry(client, 1, "whatever")).to.be.rejectedWith(/0\/31\/0/);
        expect(writes.acl).to.equal(0);
    });

    it("deleteAclEntry writes the remaining entries when the read succeeded", async () => {
        const { client, writes } = clientReading({
            "0/62/5": 1,
            "0/31/0": [{ "1": 5, "2": 2, "3": [9], "254": 1 }],
        });
        await deleteAclEntry(client, 1, "whatever");
        expect(writes.acl).to.equal(1);
    });

    it("deleteBindingAtIndex refuses to write when the binding read returned no list", async () => {
        const { client, writes } = clientReading({ "0/62/5": 1 });
        await expect(deleteBindingAtIndex(client, node({}), 1, 0)).to.be.rejectedWith(/1\/30\/0/);
        expect(writes.binding).to.equal(0);
    });

    it("addBinding refuses to write when the binding read returned no list", async () => {
        // The target's ACL already grants Operate on 1/6, so ensureBindingAcl passes and the run
        // reaches the binding read, which answers only 0/62/5.
        const { client, writes } = clientReading({
            "0/62/5": 1,
            "0/31/0": [{ "1": 3, "2": 2, "3": [1], "4": [{ "0": 6, "1": 1 }], "254": 1 }],
        });
        await expect(addBinding(client, node({}, 1), 1, 2, 1, 6)).to.be.rejectedWith(/1\/30\/0/);
        expect(writes.acl).to.equal(0);
        expect(writes.binding).to.equal(0);
    });
});
