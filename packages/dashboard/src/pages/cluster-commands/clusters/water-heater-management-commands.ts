/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/filled-button";
import "@material/web/button/outlined-button";
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";
import {
    cancelBoost,
    startBoost,
    waterHeaterManagementInfo,
    WATER_HEATER_MANAGEMENT_CLUSTER_ID,
    type BoostInfoStruct,
    type WaterHeaterManagementInfo,
} from "../../../util/water-heater-management.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

@customElement("water-heater-management-cluster-commands")
export class WaterHeaterManagementClusterCommands extends BaseClusterCommands {
    @state() private _info?: WaterHeaterManagementInfo;
    @state() private _boostDuration = 3600;
    @state() private _boostDurationInput = "3600";
    @state() private _boostEmergency = false;
    @state() private _boostOneShot = false;
    @state() private _boostTemporarySetpoint = "";
    @state() private _boostTargetPercentage = "";
    @state() private _isBootsting = false;

    override willUpdate(changedProperties: Map<string, unknown>) {
        super.willUpdate(changedProperties);
        if (!this.node || this.cluster !== WATER_HEATER_MANAGEMENT_CLUSTER_ID) {
            this._info = undefined;
            return;
        }

        if (changedProperties.has("node") || changedProperties.has("endpoint")) {
            this._loadInfo();
        }
    }

    private _loadInfo() {
        if (!this.node) return;
        this._info = waterHeaterManagementInfo(this.node.attributes, this.endpoint);
    }

    override render() {
        if (!this.node || !this._info?.supported) return nothing;

        return html`
            <details class="command-panel" open>
                <summary>Water Heater Management</summary>
                <div class="command-content">
                    ${this._renderStatus()} ${this._renderBoost()} ${this._renderControls()}
                </div>
            </details>
        `;
    }

    private _renderStatus(): TemplateResult {
        const { heaterTypes, heatDemandTypes, tankPercentage, boostState, boostActive } = this._info!;

        return html`
            <div class="status-section">
                <h4>Status</h4>
                <dl>
                    <dt>Heater Types:</dt>
                    <dd>${heaterTypes?.length ? heaterTypes.join(", ") : "—"}</dd>
                    <dt>Heat Demand:</dt>
                    <dd>${heatDemandTypes?.length ? heatDemandTypes.join(", ") : "None"}</dd>
                    <dt>Tank Level:</dt>
                    <dd>${tankPercentage !== undefined ? `${tankPercentage}%` : "—"}</dd>
                    <dt>Boost State:</dt>
                    <dd>${boostState ?? "—"} ${boostActive ? html`<span class="badge">Active</span>` : nothing}</dd>
                </dl>
            </div>
        `;
    }

    private _renderBoost(): TemplateResult {
        return html`
            <div class="boost-section">
                <h4>Boost Control</h4>
                ${
                    this._info!.boostActive
                        ? html`
                              <p class="boost-active">Boost is currently active</p>
                              <md-outlined-button @click=${() => this._handleCancelBoost()}>
                                  Cancel Boost
                              </md-outlined-button>
                          `
                        : html`
                              <div class="boost-form">
                                  <div class="form-group">
                                      <label for="boost-duration">Duration (seconds)</label>
                                      <input
                                          id="boost-duration"
                                          type="number"
                                          min="1"
                                          max="86400"
                                          .value=${live(this._boostDurationInput)}
                                          @change=${(e: Event) => {
                                              const input = e.target as HTMLInputElement;
                                              this._boostDurationInput = input.value;
                                              this._boostDuration = parseInt(input.value) || 3600;
                                          }}
                                      />
                                  </div>

                                  <div class="form-group">
                                      <label>
                                          <input
                                              type="checkbox"
                                              .checked=${this._boostOneShot}
                                              @change=${(e: Event) => {
                                                  this._boostOneShot = (e.target as HTMLInputElement).checked;
                                              }}
                                          />
                                          One Shot
                                      </label>
                                  </div>

                                  <div class="form-group">
                                      <label>
                                          <input
                                              type="checkbox"
                                              .checked=${this._boostEmergency}
                                              @change=${(e: Event) => {
                                                  this._boostEmergency = (e.target as HTMLInputElement).checked;
                                              }}
                                          />
                                          Emergency Boost
                                      </label>
                                  </div>

                                  <div class="form-group">
                                      <label for="boost-temp">Temporary Setpoint (°C, optional)</label>
                                      <input
                                          id="boost-temp"
                                          type="number"
                                          step="0.5"
                                          .value=${live(this._boostTemporarySetpoint)}
                                          @change=${(e: Event) => {
                                              this._boostTemporarySetpoint = (e.target as HTMLInputElement).value;
                                          }}
                                          placeholder="Optional"
                                      />
                                  </div>

                                  <div class="form-group">
                                      <label for="boost-target">Target Tank % (optional)</label>
                                      <input
                                          id="boost-target"
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="1"
                                          .value=${live(this._boostTargetPercentage)}
                                          @change=${(e: Event) => {
                                              this._boostTargetPercentage = (e.target as HTMLInputElement).value;
                                          }}
                                          placeholder="Optional"
                                      />
                                  </div>

                                  <md-filled-button
                                      ?disabled=${this._isBootsting}
                                      @click=${() => this._handleStartBoost()}
                                  >
                                      ${this._isBootsting ? "Starting..." : "Start Boost"}
                                  </md-filled-button>
                              </div>
                          `
                }
            </div>
        `;
    }

    private _renderControls(): TemplateResult | typeof nothing {
        const { supportsEnergyManagement, tankVolumeL, estimatedHeatRequiredMwh } = this._info!;

        if (!supportsEnergyManagement) {
            return nothing;
        }

        return html`
            <div class="controls-section">
                <h4>Energy Management</h4>
                <dl>
                    ${
                        tankVolumeL !== undefined
                            ? html`<dt>Tank Volume:</dt>
                                  <dd>${tankVolumeL} L</dd>`
                            : nothing
                    }
                    ${
                        estimatedHeatRequiredMwh !== undefined
                            ? html`<dt>Estimated Heat Required:</dt>
                                  <dd>${estimatedHeatRequiredMwh} MWh</dd>`
                            : nothing
                    }
                </dl>
            </div>
        `;
    }

    private async _handleStartBoost() {
        if (!this.node) return;
        this._isBootsting = true;

        const params: BoostInfoStruct = {
            duration: this._boostDuration,
        };

        if (this._boostOneShot) {
            params.oneShot = this._boostOneShot;
        }
        if (this._boostEmergency) {
            params.emergencyBoost = this._boostEmergency;
        }
        if (this._boostTemporarySetpoint) {
            params.temporarySetpoint = parseFloat(this._boostTemporarySetpoint);
        }
        if (this._boostTargetPercentage) {
            params.targetPercentage = parseFloat(this._boostTargetPercentage);
        }

        const success = await startBoost(this.client, this.node.node_id, this.endpoint, params);

        this._isBootsting = false;
        if (success) {
            this._loadInfo();
        }
    }

    private async _handleCancelBoost() {
        if (!this.node) return;
        this._isBootsting = true;

        const success = await cancelBoost(this.client, this.node.node_id, this.endpoint);

        this._isBootsting = false;
        if (success) {
            this._loadInfo();
        }
    }

    static override styles: CSSResultGroup = css`
        .command-panel {
            margin: 1rem 0;
        }

        summary {
            cursor: pointer;
            font-weight: 500;
            padding: 0.5rem;
        }

        .command-content {
            padding: 1rem;
            border: 1px solid var(--md-sys-color-outline);
            border-top: none;
        }

        .status-section,
        .boost-section,
        .controls-section {
            margin-bottom: 1.5rem;
        }

        .status-section:last-child,
        .boost-section:last-child,
        .controls-section:last-child {
            margin-bottom: 0;
        }

        h4 {
            margin: 0 0 0.75rem 0;
            font-size: 0.95rem;
        }

        dl {
            margin: 0;
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0.5rem 1rem;
        }

        dt {
            font-weight: 500;
            color: var(--md-sys-color-on-surface-variant);
        }

        dd {
            margin: 0;
            color: var(--md-sys-color-on-surface);
        }

        .badge {
            display: inline-block;
            background: var(--md-sys-color-error);
            color: var(--md-sys-color-on-error);
            padding: 0.2rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.85rem;
            margin-left: 0.5rem;
        }

        .boost-active {
            color: var(--md-sys-color-error);
            font-weight: 500;
            margin: 0 0 1rem 0;
        }

        .boost-form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .form-group label {
            font-size: 0.9rem;
            color: var(--md-sys-color-on-surface);
        }

        .form-group input[type="checkbox"] {
            margin-right: 0.5rem;
        }

        .form-group input[type="number"],
        .temperature-control input {
            padding: 0.5rem;
            border: 1px solid var(--md-sys-color-outline);
            border-radius: 0.25rem;
            font-size: 0.95rem;
        }

        .temperature-control {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        .temperature-control input {
            flex: 1;
        }

        .unit {
            color: var(--md-sys-color-on-surface-variant);
            font-weight: 500;
        }

        .hint {
            font-size: 0.85rem;
            color: var(--md-sys-color-on-surface-variant);
            margin: 0.5rem 0 0 0;
        }

        md-filled-button,
        md-outlined-button {
            margin-top: 0.5rem;
        }
    `;
}

registerClusterCommands(WATER_HEATER_MANAGEMENT_CLUSTER_ID, "water-heater-management-cluster-commands");
