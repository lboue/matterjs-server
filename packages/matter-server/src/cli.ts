/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI argument parser for Matter Server.
 * Compatible with Python Matter Server CLI interface.
 */

import { Command, Option } from "commander";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Read version from package.json using an ESM-native approach
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
const VERSION = packageJson.version;

// Default values
const DEFAULT_VENDOR_ID = 0xfff1;
const DEFAULT_PORT = 5580;
const DEFAULT_STORAGE_PATH = join(homedir(), ".matter_server");
const DEFAULT_FABRIC_ID = 1;

// Log level enums
const LOG_LEVELS = ["critical", "error", "warning", "info", "debug", "verbose"] as const;
const SDK_LOG_LEVELS = ["none", "error", "progress", "detail", "automation"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface CliOptions {
    // Fabric configuration
    vendorId: number;
    fabricId: number | undefined;

    // Server configuration
    storagePath: string;
    port: number;
    listenAddress: string[] | null;

    // Logging configuration
    logLevel: LogLevel;
    logFile: string | null;

    // Network configuration
    primaryInterface: string | null;

    // Certificate configuration
    enableTestNetDcl: boolean;

    // Bluetooth configuration
    bluetoothAdapter: number | null;

    // OTA configuration
    disableOta: boolean;
    otaProviderDir: string | null;

    // Dashboard configuration
    disableDashboard: boolean;
}

function parseIntOption(value: string): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Invalid integer: ${value}`);
    }
    return parsed;
}

function collectAddresses(value: string, previous: string[]): string[] {
    return previous.concat(value);
}

/** Deprecated options that are still accepted but no longer used */
const DEPRECATED_OPTIONS: Record<string, string> = {
    logLevelSdk: "--log-level-sdk",
    logNodeIds: "--log-node-ids",
    paaRootCertDir: "--paa-root-cert-dir",
    disableServerInteractions: "--disable-server-interactions",
};

export function parseCliArgs(argv?: string[]): CliOptions {
    const program = new Command();

    program.name("matter-server").description("Matter Controller Server using WebSockets.").version(VERSION);

    program
        .option("--vendorid <id>", "Vendor ID for the Fabric", parseIntOption, DEFAULT_VENDOR_ID)
        .option(
            "--fabricid <id>",
            "Fabric ID for the Fabric (random if not specified)",
            parseIntOption,
            DEFAULT_FABRIC_ID,
        )
        .option("--storage-path <path>", "Storage path to keep persistent data", DEFAULT_STORAGE_PATH)
        .option("--port <port>", "TCP Port for WebSocket server", parseIntOption, DEFAULT_PORT)
        .option(
            "--listen-address <address>",
            "IP address to bind WebSocket server (repeatable, default: bind all)",
            collectAddresses,
            [],
        )
        .addOption(new Option("--log-level <level>", "Global logging level").choices(LOG_LEVELS).default("info"))
        .option("--log-file <path>", "Log file path (optional)")
        .option("--primary-interface <interface>", "Primary network interface for link-local addresses")
        .option("--enable-test-net-dcl", "Enable test-net DCL certificates", false)
        .option("--bluetooth-adapter <id>", "Bluetooth adapter HCI ID (e.g., 0 for hci0)", parseIntOption)
        .option("--disable-ota", "Disable OTA update functionality", false)
        .option("--ota-provider-dir <path>", "Directory for OTA Provider files")
        .option("--disable-dashboard", "Disable the web dashboard", false)
        // Deprecated options - still accepted for backwards compatibility
        .addOption(
            new Option("--log-level-sdk <level>", "Matter SDK logging level (deprecated, no longer used)")
                .choices(SDK_LOG_LEVELS)
                .hideHelp(),
        )
        .option("--log-node-ids <ids...>", "Node IDs to filter logs (deprecated, no longer used)")
        .option("--paa-root-cert-dir <path>", "Directory for PAA root certificates (deprecated, no longer used)")
        .option("--disable-server-interactions", "Disable server cluster interactions (deprecated, no longer used)");

    program.parse(argv);
    const opts = program.opts();

    // Warn about deprecated options if used
    for (const [key, flag] of Object.entries(DEPRECATED_OPTIONS)) {
        if (opts[key] !== undefined && opts[key] !== false) {
            console.warn(`Warning: ${flag} is deprecated and no longer supported. This option will be ignored.`);
        }
    }

    return {
        vendorId: opts.vendorid,
        fabricId: opts.fabricid ?? undefined,
        storagePath: opts.storagePath,
        port: opts.port,
        listenAddress: opts.listenAddress.length > 0 ? opts.listenAddress : null,
        logLevel: opts.logLevel,
        logFile: opts.logFile ?? null,
        primaryInterface: opts.primaryInterface ?? null,
        enableTestNetDcl: opts.enableTestNetDcl,
        bluetoothAdapter: opts.bluetoothAdapter ?? null,
        disableOta: opts.disableOta,
        otaProviderDir: opts.otaProviderDir ?? null,
        disableDashboard: opts.disableDashboard,
    };
}

// Export parsed options as singleton for use across modules
let cliOptions: CliOptions | undefined;

export function getCliOptions(): CliOptions {
    if (!cliOptions) {
        cliOptions = parseCliArgs();
    }
    return cliOptions;
}
