/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/** Resolves once the dialog closes (member added or cancelled) so callers can refresh afterward. */
export const showAddGroupMemberDialog = async (groupId: number, groupName: string): Promise<void> => {
    await import("./add-group-member-dialog.js");
    const dialog = document.createElement("add-group-member-dialog");
    dialog.groupId = groupId;
    dialog.groupName = groupName;
    return new Promise<void>(resolve => {
        dialog.addEventListener("dialog-closed", () => resolve(), { once: true });
        document.querySelector("matter-dashboard-app")?.renderRoot.appendChild(dialog);
    });
};
