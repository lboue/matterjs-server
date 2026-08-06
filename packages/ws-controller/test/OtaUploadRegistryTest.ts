/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OtaUploadRegistry } from "../src/controller/OtaUploadRegistry.js";
import { ServerError, ServerErrorCode } from "../src/types/WebSocketMessageTypes.js";

const PAST_RESERVATION_TTL_MS = 61_000;

async function expectOtaUploadError(fn: () => unknown): Promise<ServerError> {
    try {
        await fn();
    } catch (error) {
        expect(error).to.be.instanceOf(ServerError);
        expect((error as ServerError).code).to.equal(ServerErrorCode.OtaUploadError);
        return error as ServerError;
    }
    throw new Error("Expected an OtaUploadError but the call succeeded");
}

describe("OtaUploadRegistry", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "ota-upload-registry-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("reserve", () => {
        it("issues distinct ids and reports the configured limit", async () => {
            const registry = new OtaUploadRegistry({ tempDir, maxSizeBytes: 1234 });

            const first = await registry.reserve();
            const second = await registry.reserve();

            expect(first.upload_id).to.not.equal(second.upload_id);
            expect(first.max_size).to.equal(1234);
            expect(first.expires_in).to.be.greaterThan(0);
        });

        it("holds a slot from issue time, before any upload arrives", async () => {
            const registry = new OtaUploadRegistry({ tempDir, maxInFlight: 2 });

            await registry.reserve();
            await registry.reserve();

            const error = await expectOtaUploadError(() => registry.reserve());
            expect(error.message).to.include("Too many OTA uploads in flight");
        });

        it("enforces the limit against concurrent reserve() calls, not just sequential ones", async () => {
            const registry = new OtaUploadRegistry({ tempDir, maxInFlight: 2 });

            const results = await Promise.allSettled([registry.reserve(), registry.reserve(), registry.reserve()]);

            expect(results.filter(result => result.status === "fulfilled")).to.have.lengthOf(2);
            expect(results.filter(result => result.status === "rejected")).to.have.lengthOf(1);
        });

        it("frees the slot once a reservation is released", async () => {
            const registry = new OtaUploadRegistry({ tempDir, maxInFlight: 1 });

            const ticket = await registry.reserve();
            await registry.release(ticket.upload_id);

            const next = await registry.reserve();
            expect(next.upload_id).to.be.a("string");
        });
    });

    describe("claim", () => {
        it("returns a staging path inside the temp directory named after the id", async () => {
            const registry = new OtaUploadRegistry({ tempDir });
            const ticket = await registry.reserve();

            const filePath = registry.claim(ticket.upload_id);

            expect(filePath).to.equal(join(tempDir, `${ticket.upload_id}.ota`));
        });

        it("rejects an unknown id", async () => {
            const registry = new OtaUploadRegistry({ tempDir });

            await expectOtaUploadError(() => registry.claim("deadbeef"));
        });

        it("rejects a replayed id", async () => {
            const registry = new OtaUploadRegistry({ tempDir });
            const ticket = await registry.reserve();

            registry.claim(ticket.upload_id);

            const error = await expectOtaUploadError(() => registry.claim(ticket.upload_id));
            expect(error.message).to.include("already been used");
        });
    });

    describe("release", () => {
        it("deletes a partially written staged file", async () => {
            const registry = new OtaUploadRegistry({ tempDir });
            const ticket = await registry.reserve();
            const filePath = registry.claim(ticket.upload_id);
            await writeFile(filePath, "partial");

            await registry.release(ticket.upload_id);

            expect(await readdir(tempDir)).to.be.empty;
            expect(registry.filePathOf(ticket.upload_id)).to.equal(undefined);
        });

        it("is a no-op for an id that was never issued", async () => {
            const registry = new OtaUploadRegistry({ tempDir });

            await registry.release("deadbeef");
        });
    });

    describe("sweepExpired", () => {
        beforeEach(() => MockTime.reset());

        it("reclaims the slot of a reservation whose upload never started", async () => {
            const registry = new OtaUploadRegistry({ tempDir, maxInFlight: 1 });
            const ticket = await registry.reserve();

            await MockTime.advance(PAST_RESERVATION_TTL_MS);
            await registry.sweepExpired();

            expect(registry.filePathOf(ticket.upload_id)).to.equal(undefined);
            await registry.reserve();
        });

        it("keeps a reservation whose upload is already in progress", async () => {
            const registry = new OtaUploadRegistry({ tempDir });
            const ticket = await registry.reserve();
            registry.claim(ticket.upload_id);

            await MockTime.advance(PAST_RESERVATION_TTL_MS);
            await registry.sweepExpired();

            expect(registry.filePathOf(ticket.upload_id)).to.be.a("string");
        });

        it("rejects a claim once the reservation has expired", async () => {
            const registry = new OtaUploadRegistry({ tempDir });
            const ticket = await registry.reserve();

            await MockTime.advance(PAST_RESERVATION_TTL_MS);

            const error = await expectOtaUploadError(() => registry.claim(ticket.upload_id));
            expect(error.message).to.include("expired");
        });
    });

    describe("cleanupOrphans", () => {
        it("removes files left behind by a previous process", async () => {
            await writeFile(join(tempDir, "0123456789abcdef0123456789abcdef.ota"), "leftover");
            const registry = new OtaUploadRegistry({ tempDir });

            await registry.cleanupOrphans();

            expect(await readdir(tempDir)).to.be.empty;
        });

        it("leaves files and directories that aren't staged uploads alone", async () => {
            await writeFile(join(tempDir, "not-an-upload.txt"), "unrelated");
            await mkdir(join(tempDir, "some-subdir"));
            const registry = new OtaUploadRegistry({ tempDir });

            await registry.cleanupOrphans();

            expect(await readdir(tempDir)).to.have.members(["not-an-upload.txt", "some-subdir"]);
        });

        it("tolerates a missing staging directory", async () => {
            const registry = new OtaUploadRegistry({ tempDir: join(tempDir, "does-not-exist") });

            await registry.cleanupOrphans();
        });
    });
});
