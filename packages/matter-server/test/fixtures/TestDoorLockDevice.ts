/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manual test fixture: A DoorLock device with User + PIN credentials + Week Day / Year Day
 * access schedules enabled, for exercising the dashboard's Door Lock panel (PR #1004).
 *
 * Usage: npx tsx packages/matter-server/test/fixtures/TestDoorLockDevice.ts --storage-path=<path> --port=<port>
 */

import { Environment, ServerNode } from "@matter/main";
import { DoorLockDevice } from "@matter/main/devices/door-lock";
import { DoorLock } from "@matter/main/clusters/door-lock";
import { VendorId } from "@matter/main/types";

const args = process.argv.slice(2);
const storagePathArg = args.find(a => a.startsWith("--storage-path="));
const storagePath = storagePathArg?.split("=")[1] ?? ".doorlock-device-storage";
const portArg = args.find(a => a.startsWith("--port="));
const port = portArg !== undefined ? Number.parseInt(portArg.split("=")[1], 10) : 5541;
const discriminatorArg = args.find(a => a.startsWith("--discriminator="));
const discriminator = discriminatorArg !== undefined ? Number.parseInt(discriminatorArg.split("=")[1], 10) : 3841;
const passcodeArg = args.find(a => a.startsWith("--passcode="));
const passcode = passcodeArg !== undefined ? Number.parseInt(passcodeArg.split("=")[1], 10) : 20202022;

const env = Environment.default;
env.vars.set("storage.path", storagePath);

const node = await ServerNode.create({
    network: { port },

    commissioning: {
        passcode,
        discriminator,
    },

    productDescription: {
        name: "Test Door Lock",
        deviceType: DoorLockDevice.deviceType,
    },

    basicInformation: {
        vendorName: "Test Vendor",
        vendorId: VendorId(0xfff1),
        productName: "Test Door Lock",
        productId: 0x8001,
        serialNumber: "TEST-DOORLOCK-001",
        uniqueId: "test-door-lock-unique-id",
    },

    subscriptions: {
        persistenceEnabled: false,
    },
});

// The full feature set (PinCredential, User, WDSCH/YDSCH/HDSCH, ...) is baked into DoorLockServer at
// runtime, but the device's static Type<> only widens per feature actually threaded through the cluster
// type parameter — cast this throwaway fixture's config rather than fight that for a manual test tool.
await node.add(DoorLockDevice, {
    id: "doorlock",
    doorLock: {
        lockState: DoorLock.LockState.Locked,
        lockType: DoorLock.LockType.DeadBolt,
        actuatorEnabled: true,
        autoRelockTime: 0,
        operatingMode: DoorLock.OperatingMode.Normal,

        // PinCredential feature
        numberOfPinUsersSupported: 10,
        minPinCodeLength: 4,
        maxPinCodeLength: 10,
        wrongCodeEntryLimit: 5,
        userCodeTemporaryDisableTime: 60,
        requirePinForRemoteOperation: false,

        // User feature
        numberOfTotalUsersSupported: 10,
        numberOfCredentialsSupportedPerUser: 5,
        credentialRulesSupport: { single: true, dual: false, tri: false },

        // WeekDayAccessSchedules / YearDayAccessSchedules / HolidaySchedules features
        numberOfWeekDaySchedulesSupportedPerUser: 10,
        numberOfYearDaySchedulesSupportedPerUser: 10,
        numberOfHolidaySchedulesSupported: 5,
    } as Record<string, unknown>,
});

console.log("Test Door Lock Device starting...");
console.log(`Storage path: ${storagePath}`);
console.log(`Discriminator: ${discriminator}`);
console.log(`Passcode: ${passcode}`);

await node.run();

process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    node.cancel()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
});

process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    node.cancel()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
});
