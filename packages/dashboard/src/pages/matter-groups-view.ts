/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/outlined-button";
import { consume } from "@lit/context";
import type { GroupInfo, MatterClient } from "@matter-server/ws-client";
import { mdiTrashCan } from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { clientContext, tickContext } from "../client/client-context.js";
import { clusters } from "../client/models/descriptions.js";
import "../components/ha-svg-icon";
import { showAlertDialog, showPromptDialog } from "../components/dialog-box/show-dialog-box.js";
import { showAddGroupMemberDialog } from "../components/dialogs/groups/show-add-group-member-dialog.js";
import { showCreateGroupDialog } from "../components/dialogs/groups/show-create-group-dialog.js";
import { nodeIdKey } from "../util/access-control.js";
import { handleAsync } from "../util/async-handler.js";
import { getDeviceName } from "../util/node-name.js";
import "./components/footer";
import "./components/header";
import type { ActiveView } from "./components/header.js";

declare global {
    interface HTMLElementTagNameMap {
        "matter-groups-view": MatterGroupsView;
    }
}

@customElement("matter-groups-view")
class MatterGroupsView extends LitElement {
    @consume({ context: clientContext })
    public client!: MatterClient;

    @consume({ context: tickContext, subscribe: true })
    protected _tick = 0;

    @property() public activeView?: ActiveView;
    @property({ type: Boolean }) public hasThreadDevices?: boolean;
    @property({ type: Boolean }) public hasWifiDevices?: boolean;

    @state() private _groups: GroupInfo[] = [];
    @state() private _loaded = false;
    @state() private _busyGroupId?: number;

    override connectedCallback() {
        super.connectedCallback();
        void this._refresh();
    }

    override updated(changed: Map<string, unknown>) {
        super.updated(changed);
        if (changed.has("_tick")) void this._refresh();
    }

    private async _refresh() {
        if (!this.client) return;
        try {
            this._groups = await this.client.listGroups();
        } catch (err) {
            console.error("Failed to load groups", err);
        } finally {
            this._loaded = true;
        }
    }

    private async _run(action: () => Promise<void>, failTitle: string) {
        try {
            await action();
            await this._refresh();
        } catch (err) {
            await showAlertDialog({ title: failTitle, text: err instanceof Error ? err.message : String(err) });
        }
    }

    private async _createGroup() {
        await showCreateGroupDialog();
        await this._refresh();
    }

    private async _addMember(group: GroupInfo) {
        await showAddGroupMemberDialog(group.group_id, group.name);
        await this._refresh();
    }

    private async _removeMember(group: GroupInfo, nodeId: number | bigint, endpointId: number) {
        this._busyGroupId = group.group_id;
        await this._run(
            () => this.client.removeGroupMember(group.group_id, nodeId, endpointId).then(() => undefined),
            "Failed to remove member",
        );
        this._busyGroupId = undefined;
    }

    private async _deleteGroup(group: GroupInfo) {
        const confirmed = await showPromptDialog({
            title: "Delete group",
            text: `Delete "${group.name}" and remove it from all ${group.members.length} member(s)?`,
            confirmText: "Delete",
        });
        if (!confirmed) return;
        this._busyGroupId = group.group_id;
        await this._run(() => this.client.deleteGroup(group.group_id).then(() => undefined), "Failed to delete group");
        this._busyGroupId = undefined;
    }

    private _memberName(nodeId: number | bigint): string {
        const node = this.client.nodes[nodeIdKey(nodeId)];
        return node ? getDeviceName(node) : `Node ${nodeId}`;
    }

    private _clusterLabel(id: number): string {
        return clusters[id]?.label ?? `Cluster 0x${id.toString(16)}`;
    }

    private _renderGroupRow(group: GroupInfo) {
        const busy = this._busyGroupId === group.group_id;
        return html`
            <tr>
                <td>
                    <span class="ident"><b>${group.name}</b> · <span class="gid">Group ${group.group_id}</span></span>
                </td>
                <td>
                    ${group.members.length === 0
                        ? html`<span class="empty">No members</span>`
                        : html`<div class="chips">
                              ${group.members.map(
                                  m => html`
                                      <span class="chip">
                                          ${this._memberName(m.node_id)} · EP ${m.endpoint_id}
                                          <button
                                              class="chip-remove"
                                              ?disabled=${busy}
                                              title="Remove from group"
                                              @click=${handleAsync(() =>
                                                  this._removeMember(group, m.node_id, m.endpoint_id),
                                              )}
                                          >
                                              &times;
                                          </button>
                                      </span>
                                  `,
                              )}
                          </div>`}
                </td>
                <td>
                    ${group.clusters.length === 0
                        ? html`<span class="empty">Untyped</span>`
                        : group.clusters.map(c => this._clusterLabel(c)).join(", ")}
                </td>
                <td class="actions">
                    <md-outlined-button ?disabled=${busy} @click=${handleAsync(() => this._addMember(group))}
                        >Add member</md-outlined-button
                    >
                    <md-outlined-button
                        class="danger"
                        ?disabled=${busy}
                        @click=${handleAsync(() => this._deleteGroup(group))}
                    >
                        <ha-svg-icon .path=${mdiTrashCan} slot="icon"></ha-svg-icon>delete
                    </md-outlined-button>
                </td>
            </tr>
        `;
    }

    override render() {
        return html`
            <dashboard-header
                title="Open Home Foundation Matter Server"
                .activeView=${this.activeView}
                .hasThreadDevices=${this.hasThreadDevices}
                .hasWifiDevices=${this.hasWifiDevices}
            ></dashboard-header>

            <div class="content">
                <div class="toolbar">
                    <h2>Matter Groups</h2>
                    <md-outlined-button @click=${handleAsync(() => this._createGroup())}
                        >Create group</md-outlined-button
                    >
                </div>
                ${!this._loaded
                    ? html`<div class="empty">Loading…</div>`
                    : this._groups.length === 0
                      ? html`<div class="empty">No groups yet. Create one to get started.</div>`
                      : html`<table class="bt">
                            <thead>
                                <tr>
                                    <th>Group</th>
                                    <th>Members</th>
                                    <th>Clusters</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._groups.map(group => this._renderGroupRow(group))}
                            </tbody>
                        </table>`}
            </div>

            <dashboard-footer></dashboard-footer>
        `;
    }

    static override styles = css`
        :host {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            min-height: 100dvh;
            background-color: var(--md-sys-color-background);
            color: var(--md-sys-color-on-background);
        }

        .content {
            flex: 1 1 0;
            padding: 16px 24px;
        }

        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .toolbar h2 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 500;
            color: var(--md-sys-color-on-background);
        }

        .empty {
            opacity: 0.6;
            padding: 24px 0;
        }

        .bt {
            width: 100%;
            border-collapse: collapse;
        }

        .bt th {
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.6;
            padding: 8px 10px;
            border-bottom: 1px solid var(--md-sys-color-outline-variant);
        }

        .bt td {
            padding: 10px;
            border-bottom: 1px solid var(--md-sys-color-outline-variant);
            vertical-align: middle;
        }

        .ident .gid {
            opacity: 0.6;
            font-weight: 400;
        }

        .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 12px;
            background: var(--md-sys-color-surface-container-high);
            color: var(--md-sys-color-on-surface);
            font-size: 0.8rem;
        }

        .chip-remove {
            border: none;
            background: none;
            color: inherit;
            opacity: 0.6;
            cursor: pointer;
            font-size: 1rem;
            line-height: 1;
            padding: 0 0 0 2px;
        }

        .chip-remove:hover {
            opacity: 1;
        }

        .actions {
            text-align: right;
            white-space: nowrap;
        }

        md-outlined-button.danger {
            --md-outlined-button-label-text-color: var(--md-sys-color-error);
            --md-outlined-button-outline-color: var(--md-sys-color-error);
            margin-left: 8px;
        }
    `;
}
