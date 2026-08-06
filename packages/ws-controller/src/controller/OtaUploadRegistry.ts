/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, Time } from "@matter/main";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type OtaUploadTicket, ServerError } from "../types/WebSocketMessageTypes.js";

const logger = Logger.get("OtaUploadRegistry");

/** Window for the POST to *start*; once it has, the transfer itself is bounded by size, not time. */
const RESERVATION_TTL_MS = 60_000;

const DEFAULT_MAX_IN_FLIGHT = 5;

/** Filename of a staged upload: the 32-hex upload id `reserve()` generates, plus the `.ota` suffix. */
const STAGED_UPLOAD_NAME = /^[0-9a-f]{32}\.ota$/;

/**
 * Placeholder sized on observation, not on spec: shipping Matter images run ~1-8 MB (ESP32/nRF
 * class) and tens of MB for camera-class devices, so 64 MB is headroom rather than a real limit.
 * Tune via `--ota-upload-max-size-mb` if a legitimate image is rejected.
 */
const DEFAULT_MAX_SIZE_MB = 64;

export interface OtaUploadOptions {
    /** Directory holding in-progress uploads. Defaults to a subdirectory of the OS temp dir. */
    tempDir?: string;
    maxInFlight?: number;
    maxSizeBytes?: number;
}

interface Reservation {
    expiresAt: number;
    filePath: string;
    consumed: boolean;
}

/**
 * Tracks OTA firmware uploads between the `initiate_ota_upload` WebSocket command that authorizes
 * them and the HTTP POST that delivers the bytes.
 *
 * A slot is held from the moment an id is issued, so a client cannot hoard ids without uploading
 * and starve others. Ids are random and double as the on-disk filename, keeping every
 * client-supplied string out of the staging path.
 */
export class OtaUploadRegistry {
    readonly #reservations = new Map<string, Reservation>();
    readonly #tempDir: string;
    readonly #maxInFlight: number;
    readonly #maxSizeBytes: number;

    constructor(options: OtaUploadOptions = {}) {
        this.#tempDir = options.tempDir ?? join(tmpdir(), "matter-server-ota-uploads");
        this.#maxInFlight = Math.max(1, options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);
        this.#maxSizeBytes = Math.max(1, options.maxSizeBytes ?? DEFAULT_MAX_SIZE_MB * 1024 * 1024);
    }

    get tempDir() {
        return this.#tempDir;
    }

    get maxSizeBytes() {
        return this.#maxSizeBytes;
    }

    /** Issue an upload id and hold an in-flight slot for it. */
    async reserve(): Promise<OtaUploadTicket> {
        await this.sweepExpired();
        if (this.#reservations.size >= this.#maxInFlight) {
            throw ServerError.otaUploadError(
                `Too many OTA uploads in flight (limit ${this.#maxInFlight}); retry once one completes`,
            );
        }

        await mkdir(this.#tempDir, { recursive: true });

        const uploadId = randomBytes(16).toString("hex");
        this.#reservations.set(uploadId, {
            expiresAt: Time.nowMs + RESERVATION_TTL_MS,
            filePath: join(this.#tempDir, `${uploadId}.ota`),
            consumed: false,
        });

        return {
            upload_id: uploadId,
            expires_in: RESERVATION_TTL_MS / 1000,
            max_size: this.#maxSizeBytes,
        };
    }

    /**
     * Bind an arriving POST to its reservation and return the path to stream into. Marking the
     * reservation consumed here rather than on completion is what makes an id single-use: a replayed
     * or concurrent POST cannot join a transfer that is already writing to that path.
     */
    claim(uploadId: string): string {
        const reservation = this.#reservations.get(uploadId);
        if (reservation === undefined) {
            throw ServerError.otaUploadError("Unknown OTA upload id");
        }
        if (reservation.consumed) {
            throw ServerError.otaUploadError("OTA upload id has already been used");
        }
        if (reservation.expiresAt <= Time.nowMs) {
            this.#reservations.delete(uploadId);
            throw ServerError.otaUploadError("OTA upload id expired before the upload started");
        }
        reservation.consumed = true;
        return reservation.filePath;
    }

    /** Staging path of a claimed upload, or undefined once released. */
    filePathOf(uploadId: string): string | undefined {
        return this.#reservations.get(uploadId)?.filePath;
    }

    /** Free the in-flight slot and discard the staged file, whether partial or already imported. */
    async release(uploadId: string): Promise<void> {
        const reservation = this.#reservations.get(uploadId);
        if (reservation === undefined) {
            return;
        }
        this.#reservations.delete(uploadId);
        try {
            await rm(reservation.filePath, { force: true });
        } catch (error) {
            logger.warn(`Failed to remove staged OTA upload ${reservation.filePath}:`, error);
        }
    }

    /** Drop reservations whose POST never arrived, returning their slot to other clients. */
    async sweepExpired(): Promise<void> {
        const now = Time.nowMs;
        for (const [uploadId, reservation] of this.#reservations) {
            if (!reservation.consumed && reservation.expiresAt <= now) {
                await this.release(uploadId);
            }
        }
    }

    /** Discard staged files left behind by a previous process that died mid-upload. */
    async cleanupOrphans(): Promise<void> {
        let entries: string[];
        try {
            entries = await readdir(this.#tempDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                logger.warn(`Failed to read OTA upload staging directory ${this.#tempDir}:`, error);
            }
            return;
        }

        for (const entry of entries) {
            if (!STAGED_UPLOAD_NAME.test(entry)) {
                continue;
            }
            try {
                await rm(join(this.#tempDir, entry), { force: true });
                logger.info(`Removed orphaned OTA upload ${entry}`);
            } catch (error) {
                logger.warn(`Failed to remove orphaned OTA upload ${entry}:`, error);
            }
        }
    }
}
