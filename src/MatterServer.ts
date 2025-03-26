import { Environment } from "@matter/main";
import { MatterController } from "./controller/MatterController.js";
import { ConfigStorage } from "./server/ConfigStorage.js";
import { WebServer } from "./server/WebServer.js";
import { WebSocketControllerHandler } from "./server/WebSocketControllerHandler.js";

const env = Environment.default;

let controller: MatterController;
let server: WebServer;
let config: ConfigStorage;

async function start() {
    config = await ConfigStorage.create(env);
    controller = await MatterController.create(env, config);

    const host = env.vars.get("server.host", "localhost");
    const port = env.vars.get("server.port", 5580);

    server = new WebServer({ host, port }, [new WebSocketControllerHandler(controller.commandHandler, config)]);

    await server.start();
}

async function stop() {
    await server?.stop();
    await controller?.stop();
    await config?.close();
    process.exit(0);
}

start().catch(err => {
    console.error(err);
    process.exit(1);
});

process.on("SIGINT", () => stop().catch(err => console.error(err)));
process.on("SIGTERM", () => stop().catch(err => console.error(err)));
