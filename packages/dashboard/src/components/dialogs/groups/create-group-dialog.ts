/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/text-button";
import "@material/web/dialog/dialog";
import "@material/web/select/outlined-select";
import "@material/web/select/select-option";
import "@material/web/textfield/outlined-text-field";
import { consume } from "@lit/context";
import type { MdDialog } from "@material/web/dialog/dialog.js";
import { MatterClient } from "@matter-server/ws-client";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { clientContext } from "../../../client/client-context.js";
import { handleAsync } from "../../../util/async-handler.js";
import { preventDefault } from "../../../util/prevent_default.js";
import { showAlertDialog } from "../../dialog-box/show-dialog-box.js";

const NONE = "";

/**
 * Device types commonly targeted by Matter groups, each mapping to the clusters that device type
 * defines (Matter device type IDs, matching `device_types` in descriptions.ts). Matter groups
 * themselves are untyped — this is the type authority driving which clusters a member endpoint is
 * granted group-based access to when added, so members are expected to share this device type.
 */
const GROUP_DEVICE_TYPE_OPTIONS: { deviceTypeId: number; label: string; clusters: number[] }[] = [
    { deviceTypeId: 256, label: "On/Off Light", clusters: [0x0006] },
    { deviceTypeId: 257, label: "Dimmable Light", clusters: [0x0006, 0x0008] },
    { deviceTypeId: 268, label: "Color Temperature Light", clusters: [0x0006, 0x0008, 0x0300] },
    { deviceTypeId: 269, label: "Extended Color Light", clusters: [0x0006, 0x0008, 0x0300] },
    { deviceTypeId: 514, label: "Window Covering", clusters: [0x0102] },
    { deviceTypeId: 10, label: "Door Lock", clusters: [0x0101] },
    { deviceTypeId: 769, label: "Thermostat", clusters: [0x0201] },
];

@customElement("create-group-dialog")
export class CreateGroupDialog extends LitElement {
    @consume({ context: clientContext, subscribe: true })
    @property({ attribute: false })
    public client!: MatterClient;

    @state() private _name = "";
    @state() private _groupIdInput = "";
    @state() private _deviceTypeSelection = NONE;
    @state() private _busy = false;

    private async _create() {
        const name = this._name.trim();
        if (!name) {
            await showAlertDialog({ title: "Validation error", text: "Please enter a group name." });
            return;
        }
        let groupId: number | undefined;
        if (this._groupIdInput.trim() !== "") {
            groupId = parseInt(this._groupIdInput, 10);
            if (Number.isNaN(groupId) || groupId < 1 || groupId > 0xfeff) {
                await showAlertDialog({ title: "Validation error", text: "Group id must be between 1 and 65279." });
                return;
            }
        }
        const clusters =
            GROUP_DEVICE_TYPE_OPTIONS.find(o => String(o.deviceTypeId) === this._deviceTypeSelection)?.clusters ?? [];

        this._busy = true;
        try {
            await this.client.createGroup(name, groupId, clusters);
            this._close();
        } catch (err) {
            await showAlertDialog({
                title: "Failed to create group",
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
        return html`
            <md-dialog open @cancel=${preventDefault} @closed=${this._handleClosed}>
                <div slot="headline">Create group</div>
                <div slot="content">
                    <div class="form">
                        <md-outlined-text-field
                            label="Group name"
                            .value=${this._name}
                            ?disabled=${this._busy}
                            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
                        ></md-outlined-text-field>
                        <md-outlined-text-field
                            label="Group id"
                            type="number"
                            min="1"
                            max="65279"
                            supporting-text="optional — auto-assigned if left blank"
                            .value=${this._groupIdInput}
                            ?disabled=${this._busy}
                            @input=${(e: Event) => (this._groupIdInput = (e.target as HTMLInputElement).value)}
                        ></md-outlined-text-field>
                        <md-outlined-select
                            label="Device type"
                            supporting-text="the members' device type — drives which clusters this group controls"
                            .value=${this._deviceTypeSelection}
                            ?disabled=${this._busy}
                            @change=${(e: Event) => (this._deviceTypeSelection = (e.target as HTMLSelectElement).value)}
                        >
                            <md-select-option value=${NONE}><div slot="headline">— untyped —</div></md-select-option>
                            ${GROUP_DEVICE_TYPE_OPTIONS.map(
                                option => html`
                                    <md-select-option value=${String(option.deviceTypeId)}>
                                        <div slot="headline">${option.label}</div>
                                    </md-select-option>
                                `,
                            )}
                        </md-outlined-select>
                    </div>
                </div>
                <div slot="actions">
                    <md-text-button ?disabled=${this._busy} @click=${handleAsync(() => this._create())}
                        >Create</md-text-button
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
        "create-group-dialog": CreateGroupDialog;
    }
}
