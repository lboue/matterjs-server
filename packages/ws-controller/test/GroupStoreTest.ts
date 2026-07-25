/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, MockStorageService } from "@matter/general";
import { GroupStore } from "../src/server/GroupStore.js";

async function createStore(): Promise<GroupStore> {
    const env = new Environment("test");
    new MockStorageService(env);
    return GroupStore.create(env);
}

describe("GroupStore", () => {
    let store: GroupStore;

    beforeEach(async () => {
        store = await createStore();
    });

    afterEach(async () => {
        await store.close();
    });

    describe("createGroup", () => {
        it("auto-allocates a group id and a fresh key set id/epoch key", async () => {
            const a = await store.createGroup("Living room", undefined, [6]);
            const b = await store.createGroup("Kitchen", undefined, [6]);

            expect(a.groupId).to.equal(1);
            expect(b.groupId).to.equal(2);
            expect(a.keySetId).to.not.equal(b.keySetId);
            expect(a.epochKey).to.match(/^[0-9a-f]{32}$/);
            expect(a.epochKey).to.not.equal(b.epochKey);
            expect(a.members).to.deep.equal([]);
            expect(a.clusters).to.deep.equal([6]);
        });

        it("accepts an explicit group id and rejects a duplicate", async () => {
            const record = await store.createGroup("Living room", 42);
            expect(record.groupId).to.equal(42);

            let err: unknown;
            try {
                await store.createGroup("Duplicate", 42);
            } catch (e) {
                err = e;
            }
            expect((err as Error | undefined)?.message).to.equal("Group 42 already exists");
        });

        it("skips auto-allocated ids already taken by an explicit group", async () => {
            await store.createGroup("Explicit", 1);
            const record = await store.createGroup("Auto");
            expect(record.groupId).to.equal(2);
        });
    });

    describe("listGroups / getGroup", () => {
        it("returns defensive copies, not live references", async () => {
            const record = await store.createGroup("Living room", 1);
            const fetched = store.getGroup(1)!;
            fetched.members.push({ nodeId: 1n, endpointId: 1 });

            expect(store.getGroup(1)!.members).to.deep.equal([]);
            expect(record.members).to.deep.equal([]);
        });

        it("returns undefined for an unknown group", () => {
            expect(store.getGroup(999)).to.be.undefined;
        });
    });

    describe("membership", () => {
        it("adds and removes members idempotently", async () => {
            await store.createGroup("Living room", 1);

            await store.addMember(1, 10n, 1);
            const afterAdd = await store.addMember(1, 10n, 1); // idempotent
            expect(afterAdd.members).to.deep.equal([{ nodeId: 10n, endpointId: 1 }]);

            const afterSecond = await store.addMember(1, 11n, 1);
            expect(afterSecond.members).to.deep.equal([
                { nodeId: 10n, endpointId: 1 },
                { nodeId: 11n, endpointId: 1 },
            ]);

            const afterRemove = await store.removeMember(1, 10n, 1);
            expect(afterRemove.members).to.deep.equal([{ nodeId: 11n, endpointId: 1 }]);

            const afterRemoveAgain = await store.removeMember(1, 10n, 1); // idempotent
            expect(afterRemoveAgain.members).to.deep.equal([{ nodeId: 11n, endpointId: 1 }]);
        });

        it("throws when the group does not exist", async () => {
            let addErr: unknown;
            try {
                await store.addMember(999, 1n, 1);
            } catch (e) {
                addErr = e;
            }
            expect((addErr as Error | undefined)?.message).to.equal("Group 999 does not exist");

            let removeErr: unknown;
            try {
                await store.removeMember(999, 1n, 1);
            } catch (e) {
                removeErr = e;
            }
            expect((removeErr as Error | undefined)?.message).to.equal("Group 999 does not exist");
        });
    });

    describe("deleteGroup", () => {
        it("removes the group and reports whether it existed", async () => {
            await store.createGroup("Living room", 1);
            expect(await store.deleteGroup(1)).to.be.true;
            expect(store.getGroup(1)).to.be.undefined;
            expect(await store.deleteGroup(1)).to.be.false;
        });
    });

    it("serializes concurrent group creation so ids never collide", async () => {
        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => store.createGroup(`Group ${i}`)));

        const ids = results.map(r => r.groupId);
        expect(new Set(ids).size).to.equal(ids.length);
        expect(ids.sort((a, b) => a - b)).to.deep.equal(Array.from({ length: 10 }, (_, i) => i + 1));
    });
});
