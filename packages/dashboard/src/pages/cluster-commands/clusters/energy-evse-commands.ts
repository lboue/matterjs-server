/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement } from "lit/decorators.js";
import { formatDuration } from "../../../util/duration.js";
import { ENERGY_EVSE_CLUSTER_ID, energyEvseInfo, type SessionInfo } from "../../../util/energy-evse.js";
import { formatEpochTime } from "../../../util/time.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

/**
 * Read-only decoding panel for the EnergyEvse cluster (ID: 0x99 / 153).
 */
@customElement("energy-evse-cluster-commands")
export class EnergyEvseClusterCommands extends BaseClusterCommands {
    override render() {
        if (!this.node || this.cluster !== ENERGY_EVSE_CLUSTER_ID) return nothing;
        const info = energyEvseInfo(this.node.attributes, this.endpoint);
        if (!info.supported) return nothing;

        return html`
            <details class="command-panel" open>
                <summary>Energy EVSE</summary>
                <div class="command-content">
                    <dl class="info-grid">
                        ${
                            info.state
                                ? html`<dt>State</dt>
                                      <dd>${info.state}</dd>`
                                : nothing
                        }
                        ${
                            info.supplyState
                                ? html`<dt>Supply state</dt>
                                      <dd>${info.supplyState}</dd>`
                                : nothing
                        }
                        ${
                            info.faultState
                                ? html`<dt>Fault state</dt>
                                      <dd class=${info.faultActive ? "fault" : ""}>${info.faultState}</dd>`
                                : nothing
                        }
                        ${
                            info.chargingEnabledUntil !== undefined
                                ? html`<dt>Charging enabled until</dt>
                                      <dd>
                                          ${
                                              info.chargingEnabledUntil === null
                                                  ? "No expiry"
                                                  : formatEpochTime(info.chargingEnabledUntil)
                                          }
                                      </dd>`
                                : nothing
                        }
                        ${
                            info.circuitCapacityA !== undefined
                                ? html`<dt>Circuit capacity</dt>
                                      <dd>${info.circuitCapacityA} A</dd>`
                                : nothing
                        }
                        ${
                            info.minimumChargeCurrentA !== undefined
                                ? html`<dt>Minimum charge current</dt>
                                      <dd>${info.minimumChargeCurrentA} A</dd>`
                                : nothing
                        }
                        ${
                            info.maximumChargeCurrentA !== undefined
                                ? html`<dt>Maximum charge current</dt>
                                      <dd>${info.maximumChargeCurrentA} A</dd>`
                                : nothing
                        }
                        ${
                            info.userMaximumChargeCurrentA !== undefined
                                ? html`<dt>User maximum charge current</dt>
                                      <dd>${info.userMaximumChargeCurrentA} A</dd>`
                                : nothing
                        }
                        ${
                            info.randomizationDelayWindowS !== undefined
                                ? html`<dt>Randomization delay window</dt>
                                      <dd>${formatDuration(info.randomizationDelayWindowS)}</dd>`
                                : nothing
                        }
                    </dl>

                    ${this._renderSession(info.session, info.v2xSupported)}
                    ${
                        info.v2xSupported
                            ? html`
                                  <h4>Bidirectional charging (V2X)</h4>
                                  <dl class="info-grid">
                                      ${
                                          info.dischargingEnabledUntil !== undefined
                                              ? html`<dt>Discharging enabled until</dt>
                                                    <dd>
                                                        ${
                                                            info.dischargingEnabledUntil === null
                                                                ? "No expiry"
                                                                : formatEpochTime(info.dischargingEnabledUntil)
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.maximumDischargeCurrentA !== undefined
                                              ? html`<dt>Maximum discharge current</dt>
                                                    <dd>${info.maximumDischargeCurrentA} A</dd>`
                                              : nothing
                                      }
                                  </dl>
                              `
                            : nothing
                    }
                    ${
                        info.chargingPreferencesSupported
                            ? html`
                                  <h4>Charging preferences</h4>
                                  <dl class="info-grid">
                                      ${
                                          info.nextChargeStartTime !== undefined
                                              ? html`<dt>Next charge start</dt>
                                                    <dd>
                                                        ${
                                                            info.nextChargeStartTime === null
                                                                ? "None scheduled"
                                                                : formatEpochTime(info.nextChargeStartTime)
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.nextChargeTargetTime !== undefined
                                              ? html`<dt>Next charge target</dt>
                                                    <dd>
                                                        ${
                                                            info.nextChargeTargetTime === null
                                                                ? "None scheduled"
                                                                : formatEpochTime(info.nextChargeTargetTime)
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.nextChargeRequiredEnergyKWh !== undefined
                                              ? html`<dt>Next charge required energy</dt>
                                                    <dd>
                                                        ${
                                                            info.nextChargeRequiredEnergyKWh === null
                                                                ? "None"
                                                                : `${info.nextChargeRequiredEnergyKWh} kWh`
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.nextChargeTargetSoC !== undefined
                                              ? html`<dt>Next charge target SoC</dt>
                                                    <dd>
                                                        ${
                                                            info.nextChargeTargetSoC === null
                                                                ? "None"
                                                                : `${info.nextChargeTargetSoC}%`
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.approximateEvEfficiencyKmPerKWh !== undefined
                                              ? html`<dt>Approximate EV efficiency</dt>
                                                    <dd>
                                                        ${
                                                            info.approximateEvEfficiencyKmPerKWh === null
                                                                ? "Unknown"
                                                                : `${info.approximateEvEfficiencyKmPerKWh} km/kWh`
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                  </dl>
                              `
                            : nothing
                    }
                    ${
                        info.soCReportingSupported
                            ? html`
                                  <h4>Vehicle state of charge</h4>
                                  <dl class="info-grid">
                                      ${
                                          info.stateOfCharge !== undefined
                                              ? html`<dt>State of charge</dt>
                                                    <dd>
                                                        ${info.stateOfCharge === null ? "Unknown" : `${info.stateOfCharge}%`}
                                                    </dd>`
                                              : nothing
                                      }
                                      ${
                                          info.batteryCapacityKWh !== undefined
                                              ? html`<dt>Battery capacity</dt>
                                                    <dd>
                                                        ${
                                                            info.batteryCapacityKWh === null
                                                                ? "Unknown"
                                                                : `${info.batteryCapacityKWh} kWh`
                                                        }
                                                    </dd>`
                                              : nothing
                                      }
                                  </dl>
                              `
                            : nothing
                    }
                    ${
                        info.plugAndChargeSupported && info.vehicleId !== undefined
                            ? html`
                                  <h4>Plug and Charge</h4>
                                  <dl class="info-grid">
                                      <dt>Vehicle ID</dt>
                                      <dd>${info.vehicleId ?? "Unknown"}</dd>
                                  </dl>
                              `
                            : nothing
                    }
                </div>
            </details>
        `;
    }

    private _renderSession(session: SessionInfo | undefined, v2xSupported: boolean) {
        if (!session) return nothing;
        return html`
            <h4>Session</h4>
            <dl class="info-grid">
                <dt>Session ID</dt>
                <dd>${session.id}</dd>
                ${
                    session.durationS !== undefined
                        ? html`<dt>Duration</dt>
                              <dd>${formatDuration(session.durationS)}</dd>`
                        : nothing
                }
                ${
                    session.energyChargedKWh !== undefined
                        ? html`<dt>Energy charged</dt>
                              <dd>${session.energyChargedKWh} kWh</dd>`
                        : nothing
                }
                ${
                    v2xSupported && session.energyDischargedKWh !== undefined
                        ? html`<dt>Energy discharged</dt>
                              <dd>${session.energyDischargedKWh} kWh</dd>`
                        : nothing
                }
            </dl>
        `;
    }

    static override styles: CSSResultGroup = [
        BaseClusterCommands.styles,
        css`
            h4 {
                margin: 16px 0 6px 0;
                font-size: 13px;
                color: var(--md-sys-color-on-surface-variant);
            }
            .info-grid {
                display: grid;
                /* Fixed, not auto: several separate <dl>s share this panel, and each auto-sized
                   column would size to its own widest label, misaligning the value column across sections. */
                grid-template-columns: 190px 1fr;
                gap: 6px 16px;
                margin: 0;
            }
            .info-grid dt {
                color: var(--text-color, rgba(0, 0, 0, 0.6));
                font-size: 13px;
            }
            .info-grid dd {
                margin: 0;
                font-weight: 500;
            }
            .info-grid dd.fault {
                color: var(--danger-color, #d32f2f);
            }
        `,
    ];
}

registerClusterCommands(ENERGY_EVSE_CLUSTER_ID, "energy-evse-cluster-commands", {
    renderWhenOffline: true,
});

declare global {
    interface HTMLElementTagNameMap {
        "energy-evse-cluster-commands": EnergyEvseClusterCommands;
    }
}
