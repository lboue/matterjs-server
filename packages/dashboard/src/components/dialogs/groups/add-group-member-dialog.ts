/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/text-button";
import "@material/web/dialog/dialog";
import "@material/web/select/outlined-select";
import "@material/web/select/select-option";
import { consume } from "@lit/context";
import type { MdDialog } from "@material/web/dialog/dialog.js";
import { MatterClient, MatterNode } from "@matter-server/ws-client";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { clientContext } from "../../../client/client-context.js";
import { nodeIdKey } from "../../../util/access-control.js";
import { handleAsync } from "../../../util/async-handler.js";
import { getDeviceName } from "../../../util/node-name.js";
import { preventDefault } from "../../../util/prevent_default.js";
import { showAlertDialog } from "../../dialog-box/show-dialog-box.js";

@customElement("add-group-member-dialog")
export class AddGroupMemberDialog extends LitElement {
    @consume({ context: clientContext, subscribe: true })
    @property({ attribute: false })
    public client!: MatterClient;

    @property({ attribute: false }) public groupId!: number;
    @property() public groupName?: string;

    @state() private _nodeIdInput = "";
    @state() private _endpointInput = "";
    @state() private _busy = false;

    private _knownNodes(): MatterNode[] {
        return Object.values(this.client.nodes).sort((a, b) => {
            const x = BigInt(a.node_id);
            const y = BigInt(b.node_id);
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }

    private _selectedNode(): MatterNode | undefined {
        return this._nodeIdInput === "" ? undefined : this.client.nodes[this._nodeIdInput];
    }

    private _nodeEndpoints(target: MatterNode): number[] {
        const eps = new Set<number>();
        for (const key of Object.keys(target.attributes)) {
            const m = /^(\d+)\/29\/0$/.exec(key);
            if (m) eps.add(Number(m[1]));
        }
        return Array.from(eps).sort((a, b) => a - b);
    }

    private _onNodeSelect(e: Event) {
        this._nodeIdInput = (e.target as HTMLSelectElement).value;
        this._endpointInput = "";
    }

    private async _add() {
        const node = this._selectedNode();
        if (!node) {
            await showAlertDialog({ title: "Validation error", text: "Please pick a node." });
            return;
        }
        const endpoint = parseInt(this._endpointInput, 10);
        if (Number.isNaN(endpoint)) {
            await showAlertDialog({ title: "Validation error", text: "Please pick an endpoint." });
            return;
        }

        this._busy = true;
        try {
            await this.client.addGroupMember(this.groupId, node.node_id, endpoint);
            this._close();
        } catch (err) {
            await showAlertDialog({
                title: "Failed to add member",
                text: err instanceof Error ? err.message : String(err),
            });
        } finally {
            this._busy = false;
        }
    }

    private _close() {
        this.shadowRoot!.querySelector<MdDialog>("md-dialog")!.close();
    }

    private _handleClosed() {
        // bubbles + composed so the opener (outside this element's shadow root) can await it.
        this.dispatchEvent(new CustomEvent("dialog-closed", { bubbles: true, composed: true }));
        this.parentNode?.removeChild(this);
    }

    protected override render() {
        const target = this._selectedNode();
        const endpoints = target ? this._nodeEndpoints(target) : [];

        return html`
            <md-dialog open @cancel=${preventDefault} @closed=${this._handleClosed}>
                <div slot="headline">Add member to "${this.groupName ?? this.groupId}"</div>
                <div slot="content">
                    <div class="form">
                        <md-outlined-select
                            label="Node"
                            ?disabled=${this._busy}
                            .value=${this._nodeIdInput}
                            @change=${this._onNodeSelect}
                        >
                            <md-select-option value=""><div slot="headline">— pick a node —</div></md-select-option>
                            ${this._knownNodes().map(
                                n =>
                                    html`<md-select-option value=${nodeIdKey(n.node_id)}>
                                        <div slot="headline">${n.node_id.toString()} · ${getDeviceName(n)}</div>
                                    </md-select-option>`,
                            )}
                        </md-outlined-select>
                        ${target
                            ? html`<md-outlined-select
                                  label="Endpoint"
                                  ?disabled=${this._busy}
                                  .value=${this._endpointInput}
                                  @change=${(e: Event) => (this._endpointInput = (e.target as HTMLSelectElement).value)}
                              >
                                  ${endpoints.map(
                                      ep =>
                                          html`<md-select-option value=${String(ep)}
                                              ><div slot="headline">EP ${ep}</div></md-select-option
                                          >`,
                                  )}
                              </md-outlined-select>`
                            : nothing}
                    </div>
                </div>
                <div slot="actions">
                    <md-text-button ?disabled=${this._busy} @click=${handleAsync(() => this._add())}
                        >Add</md-text-button
                    >
                    <md-text-button ?disabled=${this._busy} @click=${this._close}>Cancel</md-text-button>
                </div>
            </md-dialog>
        `;
    }

    static override styles = css`
        .form {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 320px;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        "add-group-member-dialog": AddGroupMemberDialog;
    }
}
