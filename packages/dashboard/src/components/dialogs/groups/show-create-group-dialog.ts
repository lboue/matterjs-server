/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/** Resolves once the dialog closes (created or cancelled) so callers can refresh afterward. */
export const showCreateGroupDialog = async (): Promise<void> => {
    await import("./create-group-dialog.js");
    const dialog = document.createElement("create-group-dialog");
    return new Promise<void>(resolve => {
        dialog.addEventListener("dialog-closed", () => resolve(), { once: true });
        document.querySelector("matter-dashboard-app")?.renderRoot.appendChild(dialog);
    });
};
