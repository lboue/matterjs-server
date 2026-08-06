/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpServer, MatterController, WebServerHandler } from "@matter-server/ws-controller";
import { Logger, ServerError } from "@matter-server/ws-controller";
import { createWriteStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";

const logger = Logger.get("MatterServer.OtaUpload");

const UPLOAD_PATH = /^\/ota-upload\/([0-9a-f]{1,64})$/;

/** Thrown once the streamed body passes the configured limit, to distinguish it from I/O failures. */
class UploadTooLargeError extends Error {}

/**
 * Receives the body of an OTA firmware upload authorized by the `initiate_ota_upload` WebSocket
 * command and imports it into the server's OTA image store.
 *
 * Responds to POST /ota-upload/<upload_id>, where the id is the single-use ticket issued over the
 * WebSocket session. Bytes stream straight to a file named after that id, so an upload never costs
 * more than a chunk of memory and no client-supplied string ever reaches the filesystem path.
 */
export class OtaUploadHandler implements WebServerHandler {
    #controller: MatterController;

    constructor(controller: MatterController) {
        this.#controller = controller;
    }

    async register(server: HttpServer): Promise<void> {
        server.on("request", (req, res) => {
            const path = req.url?.split("?")[0];
            if (path === undefined || (path !== "/ota-upload" && !path.startsWith("/ota-upload/"))) {
                return;
            }
            if (req.method !== "POST") {
                res.writeHead(405, { Allow: "POST" });
                res.end();
                return;
            }

            const uploadId = UPLOAD_PATH.exec(path)?.[1];
            if (uploadId === undefined) {
                this.#respondError(res, 404, "Upload id missing; request one via the initiate_ota_upload command");
                req.resume();
                return;
            }

            void this.#handleUpload(req, res, uploadId);
        });
    }

    async #handleUpload(req: IncomingMessage, res: ServerResponse, uploadId: string): Promise<void> {
        const registry = this.#controller.commandHandler.otaUploads;

        let filePath: string;
        try {
            filePath = registry.claim(uploadId);
        } catch (error) {
            // Nothing was reserved, so there is no slot to release and no file to remove.
            req.resume();
            this.#respondServerError(res, error);
            return;
        }

        try {
            // Rejecting on the declared length is the only way the client reliably reads the 413:
            // once the body is flowing, aborting the write tears down the socket with it.
            const declaredSize = Number(req.headers["content-length"]);
            if (Number.isFinite(declaredSize) && declaredSize > registry.maxSizeBytes) {
                throw new UploadTooLargeError();
            }

            await this.#streamToFile(req, filePath, registry.maxSizeBytes);
            const info = await this.#controller.commandHandler.completeOtaUpload(uploadId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(info));
        } catch (error) {
            if (error instanceof UploadTooLargeError) {
                // The Content-Length pre-check rejects before the body starts flowing, so it must
                // still be drained here; a mid-stream cutoff has already destroyed req via pipeline.
                req.resume();
                this.#respondError(
                    res,
                    413,
                    `Firmware image exceeds the ${Math.round(registry.maxSizeBytes / 1024 / 1024)} MB limit`,
                );
            } else if (error instanceof ServerError) {
                this.#respondServerError(res, error);
            } else {
                logger.warn(`OTA upload ${uploadId} failed:`, error);
                this.#respondError(res, 500, "Failed to store OTA image");
            }
        } finally {
            // Releases the in-flight slot and discards the staged file; `store` has its own copy.
            await registry.release(uploadId);
        }
    }

    async #streamToFile(req: IncomingMessage, filePath: string, maxSizeBytes: number): Promise<void> {
        let size = 0;
        await pipeline(
            req,
            async function* (source: AsyncIterable<Buffer>) {
                for await (const chunk of source) {
                    size += chunk.length;
                    if (size > maxSizeBytes) {
                        throw new UploadTooLargeError();
                    }
                    yield chunk;
                }
            },
            createWriteStream(filePath),
        );
    }

    #respondServerError(res: ServerResponse, error: unknown) {
        if (error instanceof ServerError) {
            this.#respondJson(res, 400, { error_code: error.code, message: error.message });
        } else {
            this.#respondError(res, 500, "Failed to store OTA image");
        }
    }

    #respondError(res: ServerResponse, status: number, message: string) {
        this.#respondJson(res, status, { error: message });
    }

    #respondJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
        if (res.headersSent) {
            return;
        }
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    }

    async unregister(): Promise<void> {
        // Nothing to clean up
    }
}
