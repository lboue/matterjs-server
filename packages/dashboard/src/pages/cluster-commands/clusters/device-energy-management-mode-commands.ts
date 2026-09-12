/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/outlined-button";
import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement, state } from "lit/decorators.js";
import { handleAsync } from "../../../util/async-handler.js";
import {
    DEVICE_ENERGY_MANAGEMENT_MODE_CLUSTER_ID,
    decodeChangeToModeResult,
    deviceEnergyManagementModeInfo,
    type ChangeToModeResult,
} from "../../../util/device-energy-management-mode.js";
import { errorText } from "../../../util/error-text.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

const CLUSTER_ID = DEVICE_ENERGY_MANAGEMENT_MODE_CLUSTER_ID;

@customElement("device-energy-management-mode-cluster-commands")
class DeviceEnergyManagementModeClusterCommands extends BaseClusterCommands {
    @state() private _selectedMode: number | null = null;
    @state() private _busy = false;
    @state() private _result?: { mode: number; result: ChangeToModeResult };
    @state() private _error?: string;

    private async _changeToMode() {
        const node = this.node;
        const endpoint = this.endpoint;
        const mode = this._selectedMode;
        if (mode === null) return;
        this._busy = true;
        this._error = undefined;
        this._result = undefined;
        try {
            const response = await this.client.deviceCommand(node.node_id, endpoint, CLUSTER_ID, "ChangeToMode", {
                newMode: mode,
            });
            if (!this.isSameContext(node, endpoint)) return;
            this._result = { mode, result: decodeChangeToModeResult(response) };
        } catch (err) {
            if (this.isSameContext(node, endpoint)) this._error = errorText(err);
        } finally {
            if (this.isSameContext(node, endpoint)) this._busy = false;
        }
    }

    override render() {
        if (!this.node || this.cluster !== CLUSTER_ID) return nothing;
        const info = deviceEnergyManagementModeInfo(this.node.attributes, this.endpoint);
        const selected = this._selectedMode ?? info.currentMode ?? info.supportedModes[0]?.mode ?? null;

        return html`
            <details class="command-panel">
                <summary>Device Energy Management Mode</summary>
                <div class="command-content">
                    <div class="command-row">
                        <span
                            >Current mode:
                            <strong
                                >${info.currentModeLabel ?? info.currentMode ?? "—"}${
                                    info.currentModeLabel !== undefined && info.currentMode !== undefined
                                        ? ` (${info.currentMode})`
                                        : ""
                                }</strong
                            ></span
                        >
                    </div>
                    ${
                        info.startUpMode !== undefined
                            ? html`<div class="command-row">
                                  <span>Start-up mode: ${info.startUpModeLabel ?? info.startUpMode}</span>
                              </div>`
                            : nothing
                    }
                    ${
                        info.onMode !== undefined
                            ? html`<div class="command-row">
                                  <span>On mode: ${info.onModeLabel ?? info.onMode}</span>
                              </div>`
                            : nothing
                    }
                    <div class="command-row">
                        <label for="newMode">New mode:</label>
                        <select
                            id="newMode"
                            ?disabled=${this._busy || !this.node.available || info.supportedModes.length === 0}
                            @change=${(e: Event) => {
                                this._selectedMode = parseInt((e.target as HTMLSelectElement).value, 10);
                            }}
                        >
                            ${info.supportedModes.map(
                                m => html`
                                    <option value=${m.mode} .selected=${m.mode === selected}>
                                        ${m.label}
                                        (${m.mode})${
                                            m.tags.length > 0 ? ` — ${m.tags.map(t => t.label).join(", ")}` : ""
                                        }
                                    </option>
                                `,
                            )}
                        </select>
                        <md-outlined-button
                            ?disabled=${this._busy || !this.node.available || selected === null}
                            @click=${handleAsync(() => this._changeToMode())}
                            >Change To Mode</md-outlined-button
                        >
                    </div>
                    ${
                        this._result
                            ? html`<div class="result ${this._result.result.success ? "" : "result-error"}">
                                  ChangeToMode(${this._result.mode}) → ${this._result.result.statusName}
                                  (${this._result.result.status})${
                                      this._result.result.statusText
                                          ? html`: ${this._result.result.statusText}`
                                          : nothing
                                  }
                              </div>`
                            : nothing
                    }
                    ${this._error ? html`<div class="result result-error">${this._error}</div>` : nothing}
                </div>
            </details>
        `;
    }

    static override styles: CSSResultGroup = [
        BaseClusterCommands.styles,
        css`
            select {
                padding: 8px;
                border: 1px solid var(--md-sys-color-outline);
                border-radius: 4px;
                background: var(--md-sys-color-surface);
                color: var(--md-sys-color-on-surface);
                max-width: 100%;
            }
            .result {
                margin-top: 8px;
                padding: 8px 10px;
                border-radius: 6px;
                background: var(--md-sys-color-tertiary-container);
                color: var(--md-sys-color-on-tertiary-container);
            }
            .result-error {
                background: var(--md-sys-color-error-container);
                color: var(--md-sys-color-on-error-container);
            }
        `,
    ];
}

registerClusterCommands(CLUSTER_ID, "device-energy-management-mode-cluster-commands");

declare global {
    interface HTMLElementTagNameMap {
        "device-energy-management-mode-cluster-commands": DeviceEnergyManagementModeClusterCommands;
    }
}
