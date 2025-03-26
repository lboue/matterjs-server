/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Logger } from "@matter/general";
import { FabricId, FabricIndex, NodeId, Observable, ServerAddressIp } from "@matter/main";
import { GeneralCommissioning, GeneralDiagnosticsCluster, OperationalCredentials } from "@matter/main/clusters";
import { Ble } from "@matter/main/protocol";
import { ManualPairingCodeCodec, QrPairingCodeCodec, VendorId } from "@matter/main/types";
import {
    DecodedAttributeReportValue,
    DecodedEventReportValue,
    SignatureFromCommandSpec,
    SupportedTransportsSchema,
} from "@matter/protocol";
import {
    Attribute,
    Command,
    StatusResponseError,
    TlvAny,
    TlvBoolean,
    TlvByteString,
    TlvInt32,
    TlvNoResponse,
    TlvNullable,
    TlvObject,
    TlvString,
    TlvUInt64,
    TlvVoid,
} from "@matter/types";
import { CommissioningController, NodeCommissioningOptions } from "@project-chip/matter.js";
import { NodeStates, PairedNode } from "@project-chip/matter.js/device";
import { inspect } from "node:util";
import { bytesToIpV4, bytesToIpV6 } from "../server/Converters.js";
import {
    AttributeResponseStatus,
    CommissioningRequest,
    CommissioningResponse,
    DiscoveryRequest,
    DiscoveryResponse,
    InvokeByIdRequest,
    InvokeRequest,
    OpenCommissioningWindowRequest,
    OpenCommissioningWindowResponse,
    ReadAttributeRequest,
    ReadAttributeResponse,
    ReadEventRequest,
    ReadEventResponse,
    SubscribeAttributeRequest,
    SubscribeAttributeResponse,
    SubscribeEventRequest,
    SubscribeEventResponse,
    WriteAttributeByIdRequest,
    WriteAttributeRequest,
} from "../types/CommandHandler.js";

const logger = Logger.get("ControllerCommandHandler");

export class ControllerCommandHandler {
    #controller: CommissioningController;
    #started = false;
    #connected = false;
    #bleEnabled = false;
    #nodes = new Map<NodeId, PairedNode>();
    events = {
        attributeChanged: new Observable<[nodeId: NodeId, data: DecodedAttributeReportValue<any>]>(),
        eventChanged: new Observable<[nodeId: NodeId, data: DecodedEventReportValue<any>]>(),
        nodeAdded: new Observable<[nodeId: NodeId]>(),
        nodeStateChanged: new Observable<[nodeId: NodeId, state: NodeStates]>(),
        nodeStructureChanged: new Observable<[nodeId: NodeId]>(),
        nodeDecommissioned: new Observable<[nodeId: NodeId]>(),
    };

    constructor(controllerInstance: CommissioningController) {
        this.#controller = controllerInstance;

        try {
            const ble = Ble.get();
            this.#bleEnabled = true;
        } catch (e) {
            // Default is false already
        }
    }

    get started() {
        return this.#started;
    }

    get bleEnabled() {
        return this.#bleEnabled;
    }

    async start() {
        if (this.#started) return;
        this.#started = true;

        try {
            await this.#controller.start();
            logger.info(`Controller started`);
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            // Catch and log error, else the test framework hides issues here
            logger.error(errorText);
            throw error;
        }
    }

    close() {
        if (!this.#started) return;
        return this.#controller.close();
    }

    async #registerNode(nodeId: NodeId) {
        const node = await this.#controller.getNode(nodeId);

        // Wire all Events to the Event emitters
        node.events.attributeChanged.on(data => this.events.attributeChanged.emit(node.nodeId, data));
        node.events.eventTriggered.on(data => this.events.eventChanged.emit(node.nodeId, data));
        node.events.stateChanged.on(state => this.events.nodeStateChanged.emit(node.nodeId, state));
        node.events.structureChanged.on(async () => this.events.nodeStructureChanged.emit(node.nodeId));
        node.events.decommissioned.on(() => this.events.nodeDecommissioned.emit(node.nodeId));

        // Store the node for direct access
        this.#nodes.set(nodeId, node);

        return node;
    }

    async connect() {
        if (this.#connected) {
            return;
        }
        this.#connected = true;

        await this.start();

        const nodes = this.#controller.getCommissionedNodes();
        logger.info(`Found ${nodes.length} nodes: ${nodes.map(nodeId => nodeId.toString()).join(", ")}`);

        for (const nodeId of nodes) {
            try {
                logger.info(`Initializing node "${nodeId}" ...`);
                // Initialize Node
                const node = await this.#registerNode(nodeId);

                // Trigger connect to node, default values are used
                node.connect({
                    subscribeMinIntervalFloorSeconds: 1,
                    subscribeMaxIntervalCeilingSeconds: undefined,
                });
            } catch (error) {
                logger.warn(`Failed to connect to node "${nodeId}": ${(error as unknown as Error).stack}`);
            }
        }
    }

    getNodeIds() {
        return Array.from(this.#nodes.keys());
    }

    getNode(nodeId: NodeId) {
        return this.#nodes.get(nodeId);
    }

    setFabricLabel(label: string) {
        return this.#controller.updateFabricLabel(label);
    }

    disconnectNode(nodeId: NodeId) {
        return this.#controller.disconnectNode(nodeId, true);
    }

    async handleReadAttribute(data: ReadAttributeRequest): Promise<ReadAttributeResponse> {
        const { nodeId, endpointId, clusterId, attributeId, fabricFiltered = true } = data;
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();

        const { attributeData, attributeStatus } = await client.getMultipleAttributesAndStatus({
            attributes: [
                {
                    endpointId,
                    clusterId,
                    attributeId,
                },
            ],
            isFabricFiltered: fabricFiltered,
        });

        return {
            values: attributeData.map(
                ({ path: { endpointId, clusterId, attributeId }, value, version: dataVersion }) => ({
                    attributeId,
                    clusterId,
                    dataVersion,
                    endpointId,
                    value,
                }),
            ),
            status: attributeStatus?.map(({ path: { endpointId, clusterId, attributeId }, status, clusterStatus }) => ({
                attributeId,
                clusterId,
                endpointId,
                status,
                clusterStatus,
            })),
        };
    }

    async handleReadEvent(data: ReadEventRequest): Promise<ReadEventResponse> {
        const { nodeId, endpointId, clusterId, eventId, eventMin } = data;
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();
        const { eventData, eventStatus } = await client.getMultipleEventsAndStatus({
            events: [
                {
                    endpointId,
                    clusterId,
                    eventId,
                },
            ],
            eventFilters: eventMin ? [{ eventMin }] : undefined,
        });

        return {
            values: eventData.flatMap(({ path: { endpointId, clusterId, eventId }, events }) =>
                events.map(({ eventNumber, data }) => ({
                    eventId,
                    clusterId,
                    endpointId,
                    eventNumber,
                    value: data,
                })),
            ),
            status: eventStatus?.map(({ path: { endpointId, clusterId, eventId }, status, clusterStatus }) => ({
                clusterId,
                endpointId,
                eventId,
                status,
                clusterStatus,
            })),
        };
    }

    async handleSubscribeAttribute(data: SubscribeAttributeRequest): Promise<SubscribeAttributeResponse> {
        const { nodeId, endpointId, clusterId, attributeId, minInterval, maxInterval, changeListener } = data;
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();
        const updated = Observable<[void]>();
        let ignoreData = true; // We ignore data coming in during initial seeding
        const { attributeReports = [] } = await client.subscribeMultipleAttributesAndEvents({
            attributes: [
                {
                    endpointId,
                    clusterId,
                    attributeId,
                },
            ],
            minIntervalFloorSeconds: minInterval,
            maxIntervalCeilingSeconds: maxInterval,
            attributeListener: data => {
                if (ignoreData) return;
                changeListener({
                    attributeId: data.path.attributeId,
                    clusterId: data.path.clusterId,
                    endpointId: data.path.endpointId,
                    dataVersion: data.version,
                    value: data.value,
                });
            },
            updateReceived: () => {
                updated.emit();
            },
            keepSubscriptions: false,
        });
        ignoreData = false;

        return {
            values: attributeReports.map(
                ({ path: { endpointId, clusterId, attributeId }, value, version: dataVersion }) => ({
                    attributeId,
                    clusterId,
                    endpointId,
                    dataVersion,
                    value,
                }),
            ),
            updated,
        };
    }

    async handleSubscribeEvent(data: SubscribeEventRequest): Promise<SubscribeEventResponse> {
        const { nodeId, endpointId, clusterId, eventId, minInterval, maxInterval, changeListener } = data;
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();
        const updated = Observable<[void]>();
        let ignoreData = true; // We ignore data coming in during initial seeding
        const { eventReports = [] } = await client.subscribeMultipleAttributesAndEvents({
            events: [
                {
                    endpointId,
                    clusterId,
                    eventId,
                },
            ],
            minIntervalFloorSeconds: minInterval,
            maxIntervalCeilingSeconds: maxInterval,
            eventListener: data => {
                if (ignoreData) return;
                data.events.forEach(event =>
                    changeListener({
                        eventId: data.path.eventId,
                        clusterId: data.path.clusterId,
                        endpointId: data.path.endpointId,
                        eventNumber: event.eventNumber,
                        value: event.data,
                    }),
                );
            },
            updateReceived: () => {
                updated.emit();
            },
            keepSubscriptions: false,
        });
        ignoreData = false;

        return {
            values: eventReports.flatMap(({ path: { endpointId, clusterId, eventId }, events }) =>
                events.map(({ eventNumber, data }) => ({
                    eventId,
                    clusterId,
                    endpointId,
                    eventNumber,
                    value: data,
                })),
            ),
            updated,
        };
    }

    async handleWriteAttribute(data: WriteAttributeRequest): Promise<AttributeResponseStatus> {
        const { nodeId, endpointId, clusterId, attributeId, value } = data;

        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }

        const endpoint = node.getDeviceById(endpointId);
        if (endpoint === undefined) {
            throw new Error("Endpoint not found");
        }
        const client = endpoint.getClusterClientById(clusterId);
        if (client === undefined) {
            throw new Error("Cluster client not found");
        }

        logger.info("Writing attribute", attributeId, "with value", value);
        try {
            await client.attributes[attributeId].set(value);
            return {
                attributeId,
                clusterId,
                endpointId,
                status: 0,
            };
        } catch (error) {
            StatusResponseError.accept(error);
            return {
                attributeId,
                clusterId,
                endpointId,
                status: error.code,
                clusterStatus: error.clusterCode,
            };
        }
    }

    async handleInvoke(data: InvokeRequest): Promise<any> {
        const {
            nodeId,
            endpointId,
            clusterId,
            commandName,
            timedInteractionTimeoutMs: timedRequestTimeoutMs,
            // interactionTimeoutMs, // TODO
        } = data;
        let { data: commandData } = data;

        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const endpoint = node.getDeviceById(endpointId);
        if (endpoint === undefined) {
            throw new Error("Endpoint not found");
        }
        const client = endpoint.getClusterClientById(clusterId);
        if (client === undefined) {
            throw new Error("Cluster client not found");
        }
        if (!client[commandName] || !client.isCommandSupportedByName(commandName)) {
            throw new Error("Command not existing");
        }
        if (commandData && typeof commandData == "object" && Object.keys(commandData).length === 0) {
            commandData = undefined;
        }
        return (client[commandName] as unknown as SignatureFromCommandSpec<Command<any, any, any>>)(commandData, {
            timedRequestTimeoutMs,
        });
    }

    /** InvokeById minimalistic handler because only used for error testing */
    async handleInvokeById(data: InvokeByIdRequest): Promise<void> {
        const { nodeId, endpointId, clusterId, commandId, data: commandData, timedInteractionTimeoutMs } = data;
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();
        await client.invoke<Command<any, any, any>>({
            endpointId,
            clusterId: clusterId,
            command: Command(commandId, TlvAny, 0x00, TlvNoResponse, {
                timed: timedInteractionTimeoutMs !== undefined,
            }),
            request: commandData === undefined ? TlvVoid.encodeTlv() : TlvObject({}).encodeTlv(commandData as any),
            asTimedRequest: timedInteractionTimeoutMs !== undefined,
            timedRequestTimeoutMs: timedInteractionTimeoutMs,
            skipValidation: true,
        });
    }

    async handleWriteAttributeById(data: WriteAttributeByIdRequest): Promise<void> {
        const { nodeId, endpointId, clusterId, attributeId, value } = data;

        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = await node.getInteractionClient();

        logger.info("Writing attribute", attributeId, "with value", value);

        let tlvValue: any;

        if (value === null) {
            tlvValue = TlvNullable(TlvBoolean).encodeTlv(value); // Boolean is just a placeholder here
        } else if (value instanceof Uint8Array) {
            tlvValue = TlvByteString.encodeTlv(value);
        } else {
            switch (typeof value) {
                case "boolean":
                    tlvValue = TlvBoolean.encodeTlv(value);
                    break;
                case "number":
                    tlvValue = TlvInt32.encodeTlv(value);
                    break;
                case "bigint":
                    tlvValue = TlvUInt64.encodeTlv(value);
                    break;
                case "string":
                    tlvValue = TlvString.encodeTlv(value);
                    break;
                default:
                    throw new Error("Unsupported value type for Any encoding");
                    break;
            }
        }

        await client.setAttribute({
            attributeData: {
                endpointId,
                clusterId,
                attribute: Attribute(attributeId, TlvAny),
                value: tlvValue,
            },
        });
    }

    #determineCommissionOptions(data: CommissioningRequest): NodeCommissioningOptions {
        let passcode: number | undefined = undefined;
        let shortDiscriminator: number | undefined = undefined;
        let longDiscriminator: number | undefined = undefined;
        let productId: number | undefined = undefined;
        let vendorId: VendorId | undefined = undefined;
        let knownAddress: ServerAddressIp | undefined = undefined;

        if ("manualCode" in data && data.manualCode.length > 0) {
            const pairingCodeCodec = ManualPairingCodeCodec.decode(data.manualCode);
            shortDiscriminator = pairingCodeCodec.shortDiscriminator;
            longDiscriminator = undefined;
            passcode = pairingCodeCodec.passcode;
        } else if ("qrCode" in data && data.qrCode.length > 0) {
            const pairingCodeCodec = QrPairingCodeCodec.decode(data.qrCode);
            // TODO handle the case where multiple devices are included
            longDiscriminator = pairingCodeCodec[0].discriminator;
            shortDiscriminator = undefined;
            passcode = pairingCodeCodec[0].passcode;
        } else if ("passcode" in data) {
            passcode = data.passcode;
            vendorId = VendorId(data.vendorId);
            productId = data.productId;
        } else {
            throw new Error("No pairing code provided");
        }

        if (data.knownAddress !== undefined) {
            const { ip, port } = data.knownAddress;
            knownAddress = {
                type: "udp",
                ip,
                port,
            };
        }

        if (passcode == undefined) {
            throw new Error("No passcode provided");
        }

        const { onNetworkOnly } = data;
        return {
            commissioning: {
                nodeId: data.nodeId,
                regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                regulatoryCountryCode: "XX",
            },
            discovery: {
                knownAddress,
                identifierData:
                    longDiscriminator !== undefined
                        ? { longDiscriminator }
                        : shortDiscriminator !== undefined
                          ? { shortDiscriminator }
                          : vendorId !== undefined
                            ? { vendorId, productId }
                            : {},
                discoveryCapabilities: {
                    ble: this.bleEnabled && !onNetworkOnly,
                    onIpNetwork: true,
                },
            },
            passcode,
        };
    }

    async commissionNode(data: CommissioningRequest): Promise<CommissioningResponse> {
        const nodeId = await this.#controller.commissionNode(this.#determineCommissionOptions(data), {
            connectNodeAfterCommissioning: true,
        });

        await this.#registerNode(nodeId);

        this.events.nodeAdded.emit(nodeId);
        return { nodeId };
    }

    getCommissionerNodeId() {
        return this.#controller.nodeId;
    }

    async getCommissionerFabricData(): Promise<{ fabricId: FabricId; compressedFabricId: bigint }> {
        const { fabricId, operationalId } = this.#controller.paseCommissionerConfig.fabricData;
        return {
            fabricId,
            compressedFabricId: BigInt(`0x${Bytes.toHex(operationalId)}`),
        };
    }

    /** Discover commissionable devices */
    async handleDiscovery({ findBy }: DiscoveryRequest): Promise<DiscoveryResponse> {
        const result = await this.#controller.discoverCommissionableDevices(
            findBy ?? {},
            { onIpNetwork: true },
            undefined,
            3, // Just check for 3 sec
        );
        logger.info("Discovered result", result);
        // Chip is not removing old discoveries when being stopped, so we still have old and new devices in the result
        // but the expectation is that it was reset and only new devices are in the result
        const latestDiscovery = result[result.length - 1];
        if (latestDiscovery === undefined) {
            return [];
        }
        return [latestDiscovery].map(({ DT, DN, CM, D, RI, PH, PI, T, VP, deviceIdentifier, addresses, SII, SAI }) => {
            const { tcpClient: supportsTcpClient, tcpServer: supportsTcpServer } = SupportedTransportsSchema.decode(
                T ?? 0,
            );
            const vendorId = VP === undefined ? -1 : VP.includes("+") ? parseInt(VP.split("+")[0]) : parseInt(VP);
            const productId = VP === undefined ? -1 : VP.includes("+") ? parseInt(VP.split("+")[1]) : -1;
            const port = addresses.length ? (addresses[0] as ServerAddressIp).port : 0;
            const numIPs = addresses.length;
            return {
                commissioningMode: CM,
                deviceName: DN ?? "",
                deviceType: DT ?? 0,
                hostName: "000000000000", // Right now we do not return real hostname, only used internally
                instanceName: deviceIdentifier,
                longDiscriminator: D,
                numIPs,
                pairingHint: PH ?? -1,
                pairingInstruction: PI ?? "",
                port,
                productId,
                rotatingId: RI ?? "",
                rotatingIdLen: RI?.length ?? 0,
                shortDiscriminator: (D >> 8) & 0x0f,
                vendorId,
                supportsTcpServer,
                supportsTcpClient,
                addresses: (addresses.filter(({ type }) => type === "udp") as ServerAddressIp[]).map(({ ip }) => ip),
                mrpSessionIdleInterval: SII,
                mrpSessionActiveInterval: SAI,
            };
        });
    }

    async getNodeIpAddresses(nodeId: NodeId, preferCache = true) {
        const node = this.getNode(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        const addresses = new Set<string>();
        const generalDiag = node.getRootClusterClient(GeneralDiagnosticsCluster);
        if (generalDiag) {
            try {
                const networkInterfaces = await generalDiag.getNetworkInterfacesAttribute(preferCache ? true : true);
                if (networkInterfaces) {
                    const interfaces = networkInterfaces.filter(({ isOperational }) => isOperational);
                    if (interfaces.length) {
                        logger.info(`Found ${interfaces.length} operational network interfaces`, interfaces);
                        interfaces.forEach(({ name, hardwareAddress, iPv4Addresses, iPv6Addresses }, index) => {
                            iPv4Addresses.forEach(ip => addresses.add(bytesToIpV4(ip)));
                            iPv6Addresses.forEach(ip => addresses.add(bytesToIpV6(ip)));
                        });
                    }
                }
            } catch (e) {
                logger.info(`Failed to get network interfaces: ${e}`);
            }
        }
        return Array.from(addresses.values());
    }

    async decommissionNode(nodeId: NodeId) {
        const node = this.getNode(nodeId);
        await this.#controller.removeNode(NodeId(BigInt(nodeId)), !!node?.isConnected);
        this.#nodes.delete(nodeId);
    }

    async openCommissioningWindow(data: OpenCommissioningWindowRequest): Promise<OpenCommissioningWindowResponse> {
        const { nodeId, timeout } = data;
        const node = this.getNode(nodeId);
        if (node == undefined) {
            throw new Error("Node not found");
        }
        const { manualPairingCode, qrPairingCode } = await node.openEnhancedCommissioningWindow(timeout);
        return { manualCode: manualPairingCode, qrCode: qrPairingCode };
    }

    async getFabrics(nodeId: NodeId) {
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = node.getRootClusterClient(OperationalCredentials.Cluster);
        if (client === undefined) {
            throw new Error("GeneralCommissioning.Cluster not found");
        }
        return (await client.getFabricsAttribute()).map(({ fabricId, fabricIndex, vendorId, label }) => ({
            fabricId,
            vendorId,
            fabricIndex,
            label,
        }));
    }

    removeFabric(nodeId: NodeId, fabricIndex: FabricIndex) {
        const node = this.getNode(nodeId);
        if (node === undefined) {
            throw new Error("Node not found");
        }
        const client = node.getRootClusterClient(OperationalCredentials.Cluster);
        if (client === undefined) {
            throw new Error("GeneralCommissioning.Cluster not found");
        }
        return client.removeFabric({ fabricIndex });
    }
}
