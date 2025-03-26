import { Logger } from "@matter/general";
import { AttributeId, camelize, ClusterId, FabricIndex, NodeId } from "@matter/main";
import { AggregatorEndpointDefinition } from "@matter/main/endpoints";
import { SupportedAttributeClient } from "@matter/main/protocol";
import { EndpointNumber, QrPairingCodeCodec } from "@matter/main/types";
import { ControllerCommissioningFlowOptions, DecodedAttributeReportValue } from "@matter/protocol";
import { getClusterById } from "@matter/types";
import { Endpoint, NodeStates } from "@project-chip/matter.js/device";
import { WebSocketServer } from "ws";
import { ControllerCommandHandler } from "../controller/ControllerCommandHandler.js";
import { VendorIds } from "../data/VendorIDs.js";
import { ClusterMap, ClusterMapEntry } from "../model/ModelMapper.js";
import { HttpServer, WebServerHandler } from "../types/WebServer.js";
import {
    ArgsOf,
    AttributesData,
    ErrorResultMessage,
    EventTypes,
    MatterNode,
    ResponseOf,
    ServerInfoMessage,
    SuccessResultMessage,
} from "../types/WebSocketMessageTypes.js";
import { ConfigStorage } from "./ConfigStorage.js";
import {
    buildAttributePath,
    convertMatterToWebSocketTagBased,
    getDateAsString,
    splitAttributePath,
    toPythonJson,
} from "./Converters.js";

const logger = Logger.get("WebSocketControllerHandler");

export class WebSocketControllerHandler implements WebServerHandler {
    #commandHandler: ControllerCommandHandler;
    #config: ConfigStorage;
    #wss?: WebSocketServer;
    #closed = false;

    constructor(commandHandler: ControllerCommandHandler, config: ConfigStorage) {
        this.#commandHandler = commandHandler;
        this.#config = config;
    }

    async register(server: HttpServer) {
        const wss = (this.#wss = new WebSocketServer({ server: server, path: "/ws" }));
        wss.on("connection", ws => {
            if (this.#closed) return;

            let listening = false;

            const sendNodeDetailsEvent = <E extends EventTypes>(eventName: E, nodeId: NodeId) => {
                if (this.#closed || !listening) return;

                switch (eventName) {
                    case "node_added":
                    case "node_updated":
                        this.#collectNodeDetails(nodeId).then(
                            nodeDetails => {
                                logger.info(`Sending ${eventName} event for Node ${nodeId}`, nodeDetails);
                                ws.send(toPythonJson({ event: eventName, data: nodeDetails }));
                            },
                            err => logger.error(`Failed to collect node details for Node ${nodeId}`, err),
                        );
                        break;
                    case "node_removed":
                        logger.info(`Sending node_removed event for Node ${nodeId}`);
                        ws.send(toPythonJson({ event: eventName, data: nodeId }));
                        break;
                }
            };

            const onAttributeChanged = (nodeId: NodeId, data: DecodedAttributeReportValue<any>) => {
                if (this.#closed) return;

                const { pathStr, value } = this.#convertAttributeDataToWebSocketTagBased(data.path, data.value);
                logger.info(`Sending attribute_updated event for Node ${nodeId}`, pathStr, value);
                ws.send(
                    toPythonJson({
                        event: "attribute_updated",
                        data: [nodeId, pathStr, value],
                    }),
                );
            };
            const onEventChanged = () => {
                // Ignored for now??
            };
            const onNodeAdded = (nodeId: NodeId) => sendNodeDetailsEvent("node_added", nodeId);
            const onNodeStateChanged = (nodeId: NodeId, state: NodeStates) => {
                if (state === NodeStates.Disconnected) return;
                sendNodeDetailsEvent("node_updated", nodeId);
            };
            const onNodeStructureChanged = (nodeId: NodeId) => sendNodeDetailsEvent("node_updated", nodeId);

            const onClose = () => {
                this.#commandHandler.events.attributeChanged.off(onAttributeChanged);
                this.#commandHandler.events.eventChanged.off(onEventChanged);
                this.#commandHandler.events.nodeAdded.off(onNodeAdded);
                this.#commandHandler.events.nodeStateChanged.off(onNodeStateChanged);
                this.#commandHandler.events.nodeStructureChanged.off(onNodeStructureChanged);
            };

            ws.on("message", data =>
                this.#handleWebSocketRequest(data.toString()).then(
                    ({ response, enableListeners }) => {
                        if (this.#closed) return;
                        if (enableListeners) {
                            listening = true;
                        }
                        const responseStr = toPythonJson(response);
                        logger.info("Sending WebSocket response", responseStr);
                        ws.send(toPythonJson(response));
                    },
                    err => logger.error("Websocket request error", err),
                ),
            );

            ws.on("close", onClose);
            ws.on("error", err => {
                logger.error("Websocket error", err);
                onClose();
            });

            this.#commandHandler.events.attributeChanged.on(onAttributeChanged);
            this.#commandHandler.events.eventChanged.on(onEventChanged);
            this.#commandHandler.events.nodeAdded.on(onNodeAdded);
            this.#commandHandler.events.nodeStateChanged.on(onNodeStateChanged);
            this.#commandHandler.events.nodeStructureChanged.on(onNodeStructureChanged);

            this.#getServerInfo().then(
                response => ws.send(toPythonJson(response)),
                err => logger.error("Websocket handshake error", err),
            );
        });

        await this.#commandHandler.connect();
    }

    async unregister() {
        this.#closed = true;
        this.#wss?.close();
    }

    async #handleWebSocketRequest(
        data: string,
    ): Promise<{ response: ErrorResultMessage | SuccessResultMessage<any>; enableListeners?: boolean }> {
        let messageId: string | undefined;
        try {
            logger.info("Received WebSocket request", data);
            const request = JSON.parse(data);
            const { command, args } = request;
            messageId = request.message_id;
            let result: ResponseOf<any>;
            let enableListeners: boolean | undefined = undefined;
            switch (command) {
                case "start_listening":
                    result = await this.#handleStartListening(args);
                    enableListeners = true;
                    break;
                case "set_default_fabric_label":
                    result = await this.#handleSetDefaultFabricLabel(args);
                    break;
                case "commission_with_code":
                    result = await this.#handleCommissionWithCode(args);
                    break;
                case "get_node_ip_addresses":
                    result = await this.#handleGetNodeIpAddresses(args);
                    break;
                case "read_attribute":
                    result = await this.#handleReadAttribute(args);
                    break;
                case "get_vendor_names":
                    result = this.#handleGetVendorNames(args);
                    break;
                case "device_command":
                    result = await this.#handleDeviceCommand(args);
                    break;
                case "write_attribute":
                    result = await this.#handleWriteAttribute(args);
                    break;
                case "interview_node":
                    this.#handleInterviewNode(args);
                    result = null;
                case "ping_node": // Just simulating we did ...
                    result = await this.#handlePingNode(args);
                    break;
                case "diagnostics":
                    result = {
                        info: await this.#getServerInfo(),
                        nodes: await this.#handleGetNodes(args),
                        events: [], // ???
                    };
                    break;
                case "remove_node":
                    result = await this.#handleRemoveNode(args);
                    break;
                case "set_wifi_credentials":
                    result = await this.#handleSetWifiCredentials(args);
                    break;
                case "set_thread_dataset":
                    result = await this.#handleSetThreadDataset(args);
                    break;
                case "open_commissioning_window":
                    result = await this.#handleOpenCommissioningWindow(args);
                    break;
                case "discover_commissionable_nodes":
                    result = await this.#handleDiscoverCommissionableNodes(args);
                    break;
                case "get_matter_fabrics":
                    result = await this.#handleGetMatterFabrics(args);
                    break;
                case "remove_matter_fabric":
                    result = await this.#handleRemoveMatterFabric(args);
                    break;
                case "import_test_node":
                    result = await this.#handleImportTestNode(args);
                    break;
                case "check_node_update":
                    result = this.#handleCheckNodeUpdate(args);
                    break;
                case "update_node":
                    result = this.#handleUpdateNode(args);
                    break;
                default:
                    throw new Error(`Unknown command: ${command}`);
            }
            if (result === undefined) {
                throw new Error("No response");
            }
            logger.info("WebSocket request handled", messageId, result);
            return {
                response: {
                    message_id: messageId ?? "",
                    result,
                },
                enableListeners,
            };
        } catch (err) {
            logger.error("Failed to handle websocket request", err);
            return {
                response: {
                    message_id: messageId ?? "",
                    error_code: -1,
                    details: (err as unknown as Error).message,
                },
            };
        }
    }

    async #getServerInfo(): Promise<ServerInfoMessage> {
        await this.#commandHandler.start();
        const { fabricId: fabric_id, compressedFabricId: compressed_fabric_id } =
            await this.#commandHandler.getCommissionerFabricData();
        return {
            fabric_id,
            compressed_fabric_id,
            schema_version: 11, // TODO
            min_supported_schema_version: 11, // TODO
            sdk_version: "2024.11.4", // TODO
            wifi_credentials_set: false,
            thread_credentials_set: false,
            bluetooth_enabled: this.#commandHandler.bleEnabled,
        };
    }

    async #handleStartListening(args: ArgsOf<"start_listening">): Promise<ResponseOf<"start_listening">> {
        return await this.#handleGetNodes({});
    }

    async #handleSetDefaultFabricLabel(
        args: ArgsOf<"set_default_fabric_label">,
    ): Promise<ResponseOf<"set_default_fabric_label">> {
        const { label } = args;
        await this.#commandHandler.setFabricLabel(label);
        await this.#config.set({ fabricLabel: label });
        return null;
    }

    async #handleCommissionWithCode(args: ArgsOf<"commission_with_code">): Promise<ResponseOf<"commission_with_code">> {
        const { code, network_only } = args;
        const isQrCode = code.startsWith("MT:");

        const nextNodeId = this.#config.nextNodeId;

        let wifiCredentials: ControllerCommissioningFlowOptions["wifiNetwork"] | undefined = undefined;
        let threadCredentials: ControllerCommissioningFlowOptions["threadNetwork"] | undefined = undefined;
        if (!network_only && this.#commandHandler.bleEnabled) {
            if (this.#config.wifiSsid && this.#config.wifiCredentials) {
                wifiCredentials = {
                    wifiSsid: this.#config.wifiSsid,
                    wifiCredentials: this.#config.wifiCredentials,
                };
            }
            if (this.#config.threadDataset) {
                threadCredentials = {
                    networkName: "WeNeedOOneToScan??!!", // TODO
                    operationalDataset: this.#config.threadDataset,
                };
            }
        }

        const { nodeId } = await this.#commandHandler.commissionNode({
            nodeId: NodeId(nextNodeId),
            onNetworkOnly: network_only,
            ...(isQrCode ? { qrCode: code } : { manualCode: code }),
            wifiCredentials,
            threadCredentials,
        });
        await this.#config.set({ nextNodeId: nextNodeId + 1 });

        return await this.#collectNodeDetails(nodeId);
    }

    async #handleGetNode(args: ArgsOf<"get_node">): Promise<ResponseOf<"get_node">> {
        const nodeId = args.node_id;
        return await this.#collectNodeDetails(NodeId(nodeId));
    }

    async #handleGetNodes(args: ArgsOf<"get_nodes">): Promise<ResponseOf<"get_nodes">> {
        const nodeDetails = new Array<MatterNode>();
        for (const node of this.#commandHandler.getNodeIds()) {
            nodeDetails.push(await this.#collectNodeDetails(node));
        }
        return nodeDetails;
    }

    async #handleGetNodeIpAddresses(
        args: ArgsOf<"get_node_ip_addresses">,
    ): Promise<ResponseOf<"get_node_ip_addresses">> {
        const { node_id, prefer_cache, scoped } = args;
        const result = await this.#commandHandler.getNodeIpAddresses(NodeId(node_id), prefer_cache);
        if (!scoped) {
            return result;
        }
        return result.map(ip => (ip.includes("%") ? ip.split("%")[0] : ip));
    }

    async #handleReadAttribute(args: ArgsOf<"read_attribute">): Promise<ResponseOf<"read_attribute">> {
        const { node_id: nodeId, attribute_path } = args;
        const { endpointId, clusterId, attributeId } = splitAttributePath(attribute_path);
        const { values, status } = await this.#commandHandler.handleReadAttribute({
            nodeId: NodeId(nodeId),
            endpointId,
            clusterId,
            attributeId,
        });
        if (values.length) {
            // Can maximal be 1
            const { pathStr, value } = this.#convertAttributeDataToWebSocketTagBased(
                { endpointId, clusterId, attributeId },
                values[0].value,
            );
            return { [pathStr]: value };
        }
        if (status) {
            throw new Error(`Failed to read attribute: ${status}`);
        }
        throw new Error("Failed to read attribute");
    }

    async #handleWriteAttribute(args: ArgsOf<"write_attribute">): Promise<ResponseOf<"write_attribute">> {
        const { node_id: nodeId, attribute_path, value } = args;
        const { endpointId, clusterId, attributeId } = splitAttributePath(attribute_path);
        const { status } = await this.#commandHandler.handleWriteAttribute({
            nodeId: NodeId(nodeId),
            endpointId,
            clusterId,
            attributeId,
            value,
        });
        return [
            {
                Path: {
                    EndpointId: endpointId,
                    ClusterId: clusterId,
                    AttributeId: attributeId,
                },
                Status: status ?? 0,
            },
        ];
    }

    #handleGetVendorNames(args: ArgsOf<"get_vendor_names">): ResponseOf<"get_vendor_names"> {
        const { filter_vendors } = args;
        if (!filter_vendors || !filter_vendors.length) {
            return VendorIds;
        }
        const result: { [key: string]: string } = {};
        for (const vendorId of filter_vendors) {
            const vendorName = VendorIds[vendorId];
            if (vendorName) {
                result[vendorId] = vendorName;
            }
        }
        return result;
    }

    async #handleDeviceCommand(args: ArgsOf<"device_command">): Promise<ResponseOf<"device_command">> {
        const {
            node_id: nodeId,
            endpoint_id: endpointId,
            cluster_id: clusterId,
            command_name: commandName,
            payload,
            response_type, // Meaning?
            timed_request_timeout_ms: timedInteractionTimeoutMs,
            // interaction_timeout_ms, // TODO
        } = args;
        const result = await this.#commandHandler.handleInvoke({
            nodeId: NodeId(nodeId),
            endpointId: EndpointNumber(endpointId),
            clusterId: ClusterId(clusterId),
            commandName: camelize(commandName),
            data: payload,
            timedInteractionTimeoutMs: timedInteractionTimeoutMs !== null ? timedInteractionTimeoutMs : undefined,
        });
        if (response_type === null) {
            return null;
        }
        return this.#convertCommandDataToWebSocketTagBased(ClusterId(clusterId), commandName, result);
    }

    #handleInterviewNode(args: ArgsOf<"interview_node">) {
        const { node_id } = args;
        const nodeId = NodeId(node_id);
        const node = this.#commandHandler.getNode(nodeId);
        if (node === undefined) {
            throw new Error(`Node ${nodeId} not found`);
        }
        // hack ... in fact we do not need to re-interview because always gets updated on connect
        this.#commandHandler.events.nodeStateChanged.emit(nodeId, node.state);
    }

    // Just simulating we did for now
    async #handlePingNode(args: ArgsOf<"ping_node">): Promise<ResponseOf<"ping_node">> {
        const { node_id } = args;
        const ips = await this.#commandHandler.getNodeIpAddresses(NodeId(node_id), true);
        return ips.reduce(
            (acc, ip) => {
                acc[ip] = true;
                return acc;
            },
            {} as { [key: string]: boolean },
        );
    }

    async #handleRemoveNode(args: ArgsOf<"remove_node">): Promise<ResponseOf<"remove_node">> {
        const { node_id } = args;
        await this.#commandHandler.decommissionNode(NodeId(node_id));
        return null;
    }

    async #handleSetWifiCredentials(args: ArgsOf<"set_wifi_credentials">): Promise<ResponseOf<"set_wifi_credentials">> {
        const { ssid, credentials } = args;
        await this.#config.set({ wifiSsid: ssid, wifiCredentials: credentials });
        return {};
    }

    async #handleSetThreadDataset(args: ArgsOf<"set_thread_dataset">): Promise<ResponseOf<"set_thread_dataset">> {
        const { dataset } = args;
        await this.#config.set({ threadDataset: dataset });
        return {};
    }

    async #handleOpenCommissioningWindow(
        args: ArgsOf<"open_commissioning_window">,
    ): Promise<ResponseOf<"open_commissioning_window">> {
        const { node_id, timeout /*, iteration, option, discriminator*/ } = args;
        const nodeId = NodeId(node_id);
        const { manualCode, qrCode } = await this.#commandHandler.openCommissioningWindow({
            nodeId,
            timeout,
        });
        const pairingCodeCodec = QrPairingCodeCodec.decode(qrCode);
        return { setup_pin_code: pairingCodeCodec[0].passcode, setup_manual_code: manualCode, setup_qr_code: qrCode };
    }

    async #handleDiscoverCommissionableNodes(
        _args: ArgsOf<"discover_commissionable_nodes">,
    ): Promise<ResponseOf<"discover_commissionable_nodes">> {
        const result = await this.#commandHandler.handleDiscovery({});
        return result.map(
            ({
                commissioningMode,
                deviceName,
                deviceType,
                hostName,
                instanceName,
                longDiscriminator,
                numIPs,
                pairingHint,
                pairingInstruction,
                port,
                productId,
                rotatingId,
                rotatingIdLen,
                shortDiscriminator,
                supportsTcpClient,
                supportsTcpServer,
                vendorId,
                addresses,
                mrpSessionActiveInterval,
                mrpSessionIdleInterval,
            }) => ({
                instance_name: instanceName,
                host_name: hostName, // TODO
                port,
                long_discriminator: longDiscriminator,
                vendor_id: vendorId,
                product_id: productId,
                commissioning_mode: commissioningMode,
                device_type: deviceType,
                device_name: deviceName,
                pairing_instruction: pairingInstruction,
                pairing_hint: pairingHint,
                mrp_retry_interval_idle: mrpSessionIdleInterval,
                mrp_retry_interval_active: mrpSessionActiveInterval,
                supports_tcp: supportsTcpServer,
                addresses,
                rotating_id: rotatingId,
            }),
        );
    }

    async #handleGetMatterFabrics(args: ArgsOf<"get_matter_fabrics">): Promise<ResponseOf<"get_matter_fabrics">> {
        const { node_id } = args;
        const nodeId = NodeId(node_id);
        const fabrics = await this.#commandHandler.getFabrics(nodeId);
        return fabrics.map(({ fabricId, vendorId, fabricIndex, label }) => ({
            fabric_id: fabricId,
            vendor_id: vendorId,
            fabric_index: fabricIndex,
            fabric_label: label,
            vendor_name: VendorIds[vendorId],
        }));
    }

    async #handleRemoveMatterFabric(args: ArgsOf<"remove_matter_fabric">): Promise<ResponseOf<"remove_matter_fabric">> {
        const { node_id, fabric_index } = args;
        await this.#commandHandler.removeFabric(NodeId(node_id), FabricIndex(fabric_index));
        return {};
    }

    async #handleImportTestNode(args: ArgsOf<"import_test_node">): Promise<ResponseOf<"import_test_node">> {
        throw new Error("Not implemented");
    }

    #handleCheckNodeUpdate(args: ArgsOf<"check_node_update">): ResponseOf<"check_node_update"> {
        // Not supported currently
        return null;
    }

    #handleUpdateNode(args: ArgsOf<"update_node">): ResponseOf<"update_node"> {
        // Not supported currently
        return null;
    }

    async #collectNodeDetails(nodeId: NodeId): Promise<MatterNode> {
        const node = this.#commandHandler.getNode(nodeId);

        if (node === undefined) {
            throw new Error(`Node ${nodeId} not found`);
        }

        if (!node.initialized) {
            logger.info(`Waiting for node ${nodeId} to be initialized`);
            await node.events.initialized;
            logger.info(`Node ${nodeId} initialized`);
        }

        const rootEndpoint = node.getRootEndpoint();
        if (rootEndpoint === undefined) {
            throw new Error(`Node ${nodeId} has no root endpoint or is not yet initialized`);
        }

        const attributes: AttributesData = {};
        await this.#collectAttributesFromEndpointStructure(rootEndpoint, attributes);

        let isBridge = false;
        const aggregatorDeviceTypeId = AggregatorEndpointDefinition.deviceType;
        for (const key in attributes) {
            if (key.endsWith("/29/0")) {
                if (!Array.isArray(attributes[key])) {
                    continue;
                }
                if (attributes[key].some(entry => entry["0"] === aggregatorDeviceTypeId)) {
                    isBridge = true;
                    break;
                }
            }
        }

        return {
            node_id: node.nodeId,
            date_commissioned: getDateAsString(new Date()), // TODO, always "now"
            last_interview: getDateAsString(new Date()), // TODO, always "now"
            interview_version: 6, // TODO
            available: node.isConnected,
            is_bridge: isBridge,
            attributes,
            attribute_subscriptions: [],
        };
    }

    async #collectAttributesFromEndpointStructure(endpoint: Endpoint, attributesData: AttributesData) {
        const endpointId = endpoint.number!;
        logger.debug(`Collecting attributes for endpoint ${endpointId}`);
        for (const cluster of endpoint.getAllClusterClients()) {
            const clusterId = cluster.id;

            const clusterData = ClusterMap[cluster.name.toLowerCase()];
            for (const attributeName in cluster.attributes) {
                const attribute = cluster.attributes[attributeName];
                if (attribute === undefined) {
                    continue;
                }
                if (!(attribute instanceof SupportedAttributeClient)) {
                    continue;
                }
                const attributeValue = await attribute.get(false, false);

                const { pathStr, value } = this.#convertAttributeDataToWebSocketTagBased(
                    { endpointId, clusterId, attributeId: attribute.id },
                    attributeValue,
                    clusterData,
                );

                attributesData[pathStr] = value;
            }
        }

        // Recursively collect over all child endpoints
        for (const childEndpoint of endpoint.getChildEndpoints()) {
            await this.#collectAttributesFromEndpointStructure(childEndpoint, attributesData);
        }
    }

    #convertAttributeDataToWebSocketTagBased(
        path: { endpointId: EndpointNumber; clusterId: ClusterId; attributeId: AttributeId },
        value: unknown,
        clusterData?: ClusterMapEntry,
    ) {
        const { endpointId, clusterId, attributeId } = path;
        if (!clusterData) {
            const cluster = getClusterById(clusterId);
            clusterData = clusterData ?? ClusterMap[cluster.name.toLowerCase()];
        }

        return {
            pathStr: buildAttributePath(endpointId, clusterId, attributeId),
            value: convertMatterToWebSocketTagBased(value, clusterData.attributes[attributeId], clusterData.model),
        };
    }

    #convertCommandDataToWebSocketTagBased(
        clusterId: ClusterId,
        commandName: string,
        value: unknown,
        clusterData?: ClusterMapEntry,
    ) {
        if (!clusterData) {
            const cluster = getClusterById(clusterId);
            clusterData = clusterData ?? ClusterMap[cluster.name.toLowerCase()];
        }

        return convertMatterToWebSocketTagBased(
            value,
            clusterData.commands[commandName.toLowerCase()].responseModel,
            clusterData.model,
        );
    }
}
