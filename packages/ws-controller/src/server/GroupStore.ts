/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Logger, Mutex, StorageContext, StorageManager, StorageService } from "@matter/main";
import { randomBytes } from "node:crypto";

const logger = new Logger("GroupStore");

const EPOCH_KEY_BYTES = 16; // Matter group epoch keys are 128-bit
// Group id 0 is reserved ("all groups" wildcard); the application range starts at 1.
const GROUP_ID_BASE = 1;
const GROUP_KEY_SET_BASE = 0x0100;

export interface GroupMember {
    nodeId: bigint;
    endpointId: number;
}

export interface GroupRecord {
    groupId: number;
    name: string;
    keySetId: number;
    /**
     * Hex-encoded 128-bit epoch key. A fabric secret: `GroupKeyManagement.KeySetRead` returns this
     * redacted per spec, so it can never be read back off a device — this store is the only copy.
     */
    epochKey: string;
    members: GroupMember[];
    /** Clusters this group is meant to control; Matter groups themselves are untyped. */
    clusters: number[];
}

function cloneRecord(record: GroupRecord): GroupRecord {
    return { ...record, members: [...record.members], clusters: [...record.clusters] };
}

// Storage requires plain index-signature objects (SupportedStorageTypes), so bigint node ids are
// round-tripped through decimal strings and records are converted rather than stored as-is.
interface StoredGroupMember {
    [key: string]: string | number;
    nodeId: string;
    endpointId: number;
}

interface StoredGroupRecord {
    [key: string]: string | number | StoredGroupMember[] | number[];
    groupId: number;
    name: string;
    keySetId: number;
    epochKey: string;
    members: StoredGroupMember[];
    clusters: number[];
}

function toStored(records: GroupRecord[]): StoredGroupRecord[] {
    return records.map(r => ({
        groupId: r.groupId,
        name: r.name,
        keySetId: r.keySetId,
        epochKey: r.epochKey,
        members: r.members.map(m => ({ nodeId: m.nodeId.toString(), endpointId: m.endpointId })),
        clusters: [...r.clusters],
    }));
}

function fromStored(records: StoredGroupRecord[]): GroupRecord[] {
    return records.map(r => ({
        groupId: r.groupId,
        name: r.name,
        keySetId: r.keySetId,
        epochKey: r.epochKey,
        members: r.members.map(m => ({ nodeId: BigInt(m.nodeId), endpointId: m.endpointId })),
        clusters: [...r.clusters],
    }));
}

export class GroupStore {
    #env: Environment;
    #storageService?: StorageService;
    #storage?: StorageManager;
    #groupStore?: StorageContext;
    readonly #mutex = new Mutex(this);
    #groups: GroupRecord[] = [];
    #nextGroupId: number = GROUP_ID_BASE;
    #nextKeySetId: number = GROUP_KEY_SET_BASE;

    static async create(env: Environment): Promise<GroupStore> {
        const instance = new GroupStore(env);
        await instance.open();
        return instance;
    }

    constructor(env: Environment) {
        this.#env = env;
    }

    async open(): Promise<void> {
        this.#storageService = this.#env.get(StorageService);
        this.#storage = await this.#storageService.open("groups");
        this.#groupStore = this.#storage.createContext("values");

        const stored = await this.#groupStore.get<StoredGroupRecord[]>("groups", []);
        this.#groups = fromStored(stored);
        this.#nextGroupId = await this.#groupStore.get<number>("nextGroupId", GROUP_ID_BASE);
        this.#nextKeySetId = await this.#groupStore.get<number>("nextKeySetId", GROUP_KEY_SET_BASE);
    }

    listGroups(): GroupRecord[] {
        return this.#groups.map(cloneRecord);
    }

    getGroup(groupId: number): GroupRecord | undefined {
        const record = this.#groups.find(g => g.groupId === groupId);
        return record === undefined ? undefined : cloneRecord(record);
    }

    async createGroup(name: string, groupId?: number, clusters: number[] = []): Promise<GroupRecord> {
        return this.#mutex.produce(async () => {
            const id = groupId ?? this.#allocateGroupId();
            if (this.#groups.some(g => g.groupId === id)) {
                throw new Error(`Group ${id} already exists`);
            }
            const record: GroupRecord = {
                groupId: id,
                name,
                keySetId: this.#nextKeySetId++,
                epochKey: randomBytes(EPOCH_KEY_BYTES).toString("hex"),
                members: [],
                clusters: [...clusters],
            };
            this.#groups.push(record);
            await this.#persist();
            logger.info(`Created group ${id} ("${name}")`);
            return cloneRecord(record);
        });
    }

    async deleteGroup(groupId: number): Promise<boolean> {
        return this.#mutex.produce(async () => {
            const before = this.#groups.length;
            this.#groups = this.#groups.filter(g => g.groupId !== groupId);
            if (this.#groups.length === before) {
                return false;
            }
            await this.#persist();
            logger.info(`Deleted group ${groupId}`);
            return true;
        });
    }

    async addMember(groupId: number, nodeId: bigint, endpointId: number): Promise<GroupRecord> {
        return this.#mutex.produce(async () => {
            const record = this.#requireGroup(groupId);
            if (!record.members.some(m => m.nodeId === nodeId && m.endpointId === endpointId)) {
                record.members.push({ nodeId, endpointId });
                await this.#persist();
            }
            return cloneRecord(record);
        });
    }

    async removeMember(groupId: number, nodeId: bigint, endpointId: number): Promise<GroupRecord> {
        return this.#mutex.produce(async () => {
            const record = this.#requireGroup(groupId);
            const before = record.members.length;
            record.members = record.members.filter(m => !(m.nodeId === nodeId && m.endpointId === endpointId));
            if (record.members.length !== before) {
                await this.#persist();
            }
            return cloneRecord(record);
        });
    }

    #requireGroup(groupId: number): GroupRecord {
        const record = this.#groups.find(g => g.groupId === groupId);
        if (record === undefined) {
            throw new Error(`Group ${groupId} does not exist`);
        }
        return record;
    }

    #allocateGroupId(): number {
        let candidate = this.#nextGroupId;
        while (this.#groups.some(g => g.groupId === candidate)) {
            candidate++;
        }
        this.#nextGroupId = candidate + 1;
        return candidate;
    }

    async #persist(): Promise<void> {
        if (!this.#groupStore) {
            throw new Error("Storage not open");
        }
        await this.#groupStore.set("groups", toStored(this.#groups));
        await this.#groupStore.set("nextGroupId", this.#nextGroupId);
        await this.#groupStore.set("nextKeySetId", this.#nextKeySetId);
    }

    async close(): Promise<void> {
        if (this.#storage) {
            await this.#storage.close();
        }
    }
}
