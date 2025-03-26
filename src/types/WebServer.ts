import { type createServer } from "node:http";

export type HttpServer = ReturnType<typeof createServer>;

export interface WebServerHandler {
    register(server: HttpServer): Promise<void>;
    unregister(): Promise<void>;
}
