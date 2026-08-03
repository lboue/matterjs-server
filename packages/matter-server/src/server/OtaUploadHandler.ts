/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpServer, MatterController, WebServerHandler } from "@matter-server/ws-controller";
import { ServerError } from "@matter-server/ws-controller";

// Real firmware images are well under this; guards against unbounded memory use since the
// body is buffered in full (DclOtaUpdateService needs to read the bytes twice: header then store).
const MAX_OTA_UPLOAD_SIZE = 512 * 1024 * 1024;

/**
 * Stores a local `.ota` firmware file into the server's OTA image store.
 * Responds to POST /ota-upload with a raw binary body and an optional `file_name` query param.
 */
export class OtaUploadHandler implements WebServerHandler {
    #controller: MatterController;

    constructor(controller: MatterController) {
        this.#controller = controller;
    }

    async register(server: HttpServer): Promise<void> {
        server.on("request", (req, res) => {
            if (req.url?.split("?")[0] !== "/ota-upload") {
                return;
            }
            if (req.method !== "POST") {
                res.writeHead(405, { Allow: "POST" });
                res.end();
                return;
            }

            const fileName = new URL(req.url, "http://localhost").searchParams.get("file_name") ?? undefined;
            const chunks: Buffer[] = [];
            let size = 0;
            let aborted = false;

            req.on("data", (chunk: Buffer) => {
                if (aborted) return;
                size += chunk.length;
                if (size > MAX_OTA_UPLOAD_SIZE) {
                    aborted = true;
                    res.writeHead(413, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "File too large" }));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });

            req.on("end", () => {
                if (aborted) return;
                void (async () => {
                    try {
                        const data = new Uint8Array(Buffer.concat(chunks));
                        const info = await this.#controller.commandHandler.uploadOtaFile(data, fileName);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(info));
                    } catch (error) {
                        if (error instanceof ServerError) {
                            res.writeHead(400, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error_code: error.code, message: error.message }));
                        } else {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Failed to store OTA image" }));
                        }
                    }
                })();
            });
        });
    }

    async unregister(): Promise<void> {
        // Nothing to clean up
    }
}
