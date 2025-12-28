export type AttributesData = { [key: string]: unknown };

export interface MatterNode {
    node_id: number | bigint;
    date_commissioned: string;
    last_interview: string;
    interview_version: number;
    available: boolean;
    is_bridge: boolean;
    attributes: AttributesData;
    attribute_subscriptions: []; // ???
}

export interface APICommands {
    start_listening: {
        requestArgs: void;
        response: Array<MatterNode>;
    };
    set_default_fabric_label: {
        requestArgs: {
            label: string;
        };
        response: null;
    };
    diagnostics: {
        requestArgs: {};
        response: {
            info: ServerInfoMessage;
            nodes: Array<MatterNode>;
            events: []; // ???
        };
    };
    server_info: {
        // ???
        requestArgs: {};
        response: {};
    };
    get_nodes: {
        requestArgs: {};
        response: Array<MatterNode>; // ????
    };
    get_node: {
        requestArgs: {
            node_id: number | bigint; // ????
        };
        response: MatterNode; // ????
    };
    commission_with_code: {
        requestArgs: {
            code: string;
            network_only?: boolean;
        };
        response: MatterNode;
    };
    commission_on_network: {
        // ???
        requestArgs: {};
        response: {};
    };
    set_wifi_credentials: {
        requestArgs: {
            ssid: string;
            credentials: string;
        };
        response: {};
    };
    set_thread_dataset: {
        requestArgs: {
            dataset: string;
        };
        response: {};
    };
    open_commissioning_window: {
        requestArgs: {
            node_id: number | bigint; //????
            timeout: number; // seconds
            iteration?: number; // 1000
            option?: number; // 1??
            discriminator?: number | null; // ???
        };
        response: {
            setup_pin_code: number;
            setup_manual_code: string;
            setup_qr_code: string;
        };
    };
    discover: {
        requestArgs: {};
        response: {};
    };
    interview_node: {
        requestArgs: {
            node_id: number | bigint; // ???
        };
        response: null;
    };
    device_command: {
        requestArgs: {
            node_id: number | bigint; // ??
            endpoint_id: number;
            cluster_id: number;
            command_name: string;
            payload: unknown;
            response_type: unknown; // ????
            timed_request_timeout_ms?: number | null;
            interaction_timeout_ms?: number | null;
        };
        response: unknown;
    };
    remove_node: {
        requestArgs: {
            node_id: number | bigint; // ???
        };
        response: null;
    };
    get_vendor_names: {
        requestArgs: {
            filter_vendors?: Array<number>;
        };
        response: { [key: string]: string };
    };
    subscribe_attribute: {
        requestArgs: {};
        response: {};
    };
    read_attribute: {
        requestArgs: {
            node_id: number | bigint; // ????
            attribute_path: string;
        };
        response: AttributesData;
    };
    write_attribute: {
        requestArgs: {
            node_id: number | bigint; //???,
            attribute_path: string;
            value: unknown;
        };
        response: Array<{
            Path: {
                EndpointId: number;
                ClusterId: number;
                AttributeId: number;
            };
            Status: number;
        }>;
    };
    ping_node: {
        requestArgs: {
            node_id: number | bigint; // ????
        };
        response: { [key: string]: boolean };
    };
    import_test_node: {
        requestArgs: {};
        response: null;
    };
    get_node_ip_addresses: {
        requestArgs: {
            node_id: number | bigint; // ????
            prefer_cache: boolean;
            scoped: boolean;
        };
        response: Array<string>;
    };
    check_node_update: {
        requestArgs: { node_id: number | bigint };
        response: MatterSoftwareVersion | null;
    };
    update_node: {
        requestArgs: { nodeId: number; softwareVersion: number | string };
        response: MatterSoftwareVersion | null;
    };
    discover_commissionable_nodes: {
        requestArgs: {};
        response: CommissionableNodeData[];
    };
    get_matter_fabrics: {
        requestArgs: { node_id: number | bigint };
        response: MatterFabricData[];
    };
    remove_matter_fabric: {
        requestArgs: {
            node_id: number | bigint;
            fabric_index: number;
        };
        response: {};
    };
    set_acl_entry: {
        requestArgs: {
            node_id: number | bigint;
            entry: AccessControlEntry[];
        };
        response: AttributeWriteResult[] | null;
    };
    set_node_binding: {
        requestArgs: {
            node_id: number | bigint;
            endpoint: number;
            bindings: BindingTarget[];
        };
        response: AttributeWriteResult[] | null;
    };
}

/**
 * Access Control Entry structure for set_acl_entry command.
 * Matches Python Matter Server's AccessControlEntryStruct.
 */
export interface AccessControlEntry {
    /** 1=View, 3=Operate, 4=Manage, 5=Administer */
    privilege: number;
    /** 1=PASE, 2=CASE, 3=Group */
    auth_mode: number;
    /** List of subject NodeIds or GroupIds */
    subjects: Array<number | bigint> | null;
    /** Optional target restrictions */
    targets: AccessControlTarget[] | null;
}

export interface AccessControlTarget {
    cluster: number | null;
    endpoint: number | null;
    device_type: number | null;
}

/**
 * Binding target structure for set_node_binding command.
 * Matches Python Matter Server's TargetStruct.
 */
export interface BindingTarget {
    /** Target node ID */
    node: number | bigint | null;
    /** Target group ID */
    group: number | null;
    /** Target endpoint */
    endpoint: number | null;
    /** Target cluster */
    cluster: number | null;
}

export interface AttributeWriteResult {
    path: {
        endpoint_id: number;
        cluster_id: number;
        attribute_id: number;
    };
    status: number;
}

export interface ServerInfoMessage {
    fabric_id: bigint; // not number
    compressed_fabric_id: bigint; // not number
    schema_version: number;
    min_supported_schema_version: number;
    sdk_version: string;
    wifi_credentials_set: boolean;
    thread_credentials_set: boolean;
    bluetooth_enabled: boolean;
}

/**
 * Matter node event structure for node_event WebSocket event.
 * Matches Python Matter Server's MatterNodeEvent.
 */
export interface MatterNodeEvent {
    node_id: number | bigint;
    endpoint_id: number;
    cluster_id: number;
    event_id: number;
    event_number: number | bigint;
    priority: number; // 0=Debug, 1=Info, 2=Critical
    timestamp: number | bigint;
    timestamp_type: number; // 0=System, 1=Epoch, 2=POSIX
    data: unknown | null;
}

interface APIEvents {
    node_added: {
        data: MatterNode;
    };
    node_updated: {
        data: MatterNode;
    };
    node_removed: {
        data: number | bigint;
    };
    node_event: {
        data: MatterNodeEvent;
    };
    attribute_updated: {
        data: [node_id: number | bigint, attribute_path: string, value: unknown];
    };
    server_shutdown: {
        data: {};
    };
    endpoint_added: {
        data: {};
    };
    endpoint_removed: {
        data: {};
    };
    server_info_updated: {
        data: ServerInfoMessage;
    };
}

export type EventMessage<E extends keyof APIEvents> = {
    event: E;
    data: APIEvents[E]["data"];
};
export type EventTypes = keyof APIEvents;

export interface WebSocketConfig {
    host: string;
    port: string;
    scheme: string;
    path: string;
}

export enum UpdateSource {
    MAIN_NET_DCL = "main-net-dcl",
    TEST_NET_DCL = "test-net-dcl",
    LOCAL = "local",
}

export interface MatterSoftwareVersion {
    vid: number;
    pid: number;
    software_version: number;
    software_version_string: string;
    firmware_information?: string;
    min_applicable_software_version: number;
    max_applicable_software_version: number;
    release_notes_url?: string;
    update_source: UpdateSource;
}

export interface CommissioningParameters {
    setup_pin_code: number;
    setup_manual_code: string;
    setup_qr_code: string;
}

export interface CommissionableNodeData {
    instance_name?: string;
    host_name?: string;
    port?: number;
    long_discriminator?: number;
    vendor_id?: number;
    product_id?: number;
    commissioning_mode?: number;
    device_type?: number;
    device_name?: string;
    pairing_instruction?: string;
    pairing_hint?: number;
    mrp_retry_interval_idle?: number;
    mrp_retry_interval_active?: number;
    supports_tcp?: boolean;
    addresses?: string[];
    rotating_id?: string;
}

export interface MatterFabricData {
    fabric_id?: number | bigint;
    vendor_id?: number;
    fabric_index?: number;
    fabric_label?: string;
    vendor_name?: string;
}

export type NotificationType = "success" | "info" | "warning" | "error";
export type NodePingResult = Record<string, boolean>;

/**
 * WebSocket Command Message generic type.
 */
export interface CommandMessage {
    message_id: string;
    command: keyof APICommands;
    args?: APICommands[keyof APICommands]["requestArgs"];
}

/** WebSocket Result Message base fields type */
interface ResultMessageBase {
    message_id: string;
}

/** WebSocket Error Result Message type */
export interface ErrorResultMessage extends ResultMessageBase {
    error_code: number;
    details?: string;
}

/** WebSocket Success Result Message type */
export interface SuccessResultMessage<T extends keyof APICommands> extends ResultMessageBase {
    result: APICommands[T]["response"];
}

export type ArgsOf<R extends keyof APICommands> = APICommands[R]["requestArgs"];
export type ResponseOf<R extends keyof APICommands> = APICommands[R]["response"];
