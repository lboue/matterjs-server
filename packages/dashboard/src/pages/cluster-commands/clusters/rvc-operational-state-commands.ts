/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/filled-button";
import "@material/web/button/outlined-button";
import { css, type CSSResultGroup, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { handleAsync } from "../../../util/async-handler.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

const CLUSTER_ID = 97; // RvcOperationalState cluster
const OPERATIONAL_STATE_ATTR = 4;
const OPERATIONAL_ERROR_ATTR = 5;

/**
 * Command panel for RvcOperationalState cluster (ID: 97).
 * Provides Start, Pause, Stop, Resume, and GoHome commands.
 * Displays current operational state and error status.
 */
@customElement("rvc-operational-state-cluster-commands")
class RvcOperationalStateClusterCommands extends BaseClusterCommands {
    override render() {
        const operationalStateRaw =
            this.node?.attributes[`${this.endpoint}/${CLUSTER_ID}/${OPERATIONAL_STATE_ATTR}`];
        const operationalErrorRaw =
            this.node?.attributes[`${this.endpoint}/${CLUSTER_ID}/${OPERATIONAL_ERROR_ATTR}`];

        const operationalState = this._formatOperationalState(operationalStateRaw);
        const operationalError = this._formatOperationalError(operationalErrorRaw);

        return html`
            <details class="command-panel">
                <summary>RvcOperationalState Commands</summary>
                <div class="command-content">
                    ${this._renderStateInfo(operationalState, operationalError)}
                    <div class="command-row">
                        <md-outlined-button @click=${handleAsync(() => this._handleStart())}>
                            Start
                        </md-outlined-button>
                        <md-outlined-button @click=${handleAsync(() => this._handlePause())}>
                            Pause
                        </md-outlined-button>
                        <md-outlined-button @click=${handleAsync(() => this._handleStop())}>
                            Stop
                        </md-outlined-button>
                        <md-outlined-button @click=${handleAsync(() => this._handleResume())}>
                            Resume
                        </md-outlined-button>
                        <md-outlined-button @click=${handleAsync(() => this._handleGoHome())}>
                            Go Home
                        </md-outlined-button>
                    </div>
                </div>
            </details>
        `;
    }

    private _renderStateInfo(operationalState: string | null, operationalError: string | null) {
        if (!operationalState && !operationalError) return nothing;

        return html`
            <div class="state-info">
                ${
                    operationalState
                        ? html`
                              <div class="state-item">
                                  <span class="label">State:</span>
                                  <span class="value">${operationalState}</span>
                              </div>
                          `
                        : nothing
                }
                ${
                    operationalError
                        ? html`
                              <div class="state-item error">
                                  <span class="label">Error:</span>
                                  <span class="value">${operationalError}</span>
                              </div>
                          `
                        : nothing
                }
            </div>
        `;
    }

    private _formatOperationalState(value: unknown): string | null {
        if (value === undefined || value === null) return null;

        const stateMap: Record<number, string> = {
            0: "Stopped",
            1: "Running",
            2: "Paused",
            3: "Error",
            4: "Remote Control",
            5: "Charging",
        };

        if (typeof value === "number") {
            return stateMap[value] ?? `Unknown (${value})`;
        }
        return null;
    }

    private _formatOperationalError(value: unknown): string | null {
        if (value === undefined || value === null) return null;

        if (typeof value === "object" && value !== null) {
            const errorObj = value as Record<string, unknown>;
            const state = errorObj.state ?? errorObj.operationalError ?? 0;

            const errorStateMap: Record<number, string> = {
                0: "No Error",
                1: "Unable to Start",
                2: "Unable to Stop",
                3: "Unable to Pause",
                4: "Unable to Resume",
            };

            return errorStateMap[state as number] ?? `Unknown (${state})`;
        }
        return null;
    }

    private async _handleStart() {
        await this.sendCommand("Start");
    }

    private async _handlePause() {
        await this.sendCommand("Pause");
    }

    private async _handleStop() {
        await this.sendCommand("Stop");
    }

    private async _handleResume() {
        await this.sendCommand("Resume");
    }

    private async _handleGoHome() {
        await this.sendCommand("GoHome");
    }

    static override styles: CSSResultGroup = [
        ...(Array.isArray(BaseClusterCommands.styles)
            ? BaseClusterCommands.styles
            : [BaseClusterCommands.styles]),
        css`
            .state-info {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 16px;
                padding: 12px;
                background-color: var(--md-sys-color-surface-container-low);
                border-radius: 8px;
                border-left: 4px solid var(--md-sys-color-primary);
            }

            .state-item {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 14px;
            }

            .state-item.error {
                border-left: 4px solid var(--md-sys-color-error);
                padding-left: 12px;
                margin-left: -12px;
            }

            .state-item .label {
                font-weight: 500;
                color: var(--md-sys-color-on-surface-variant);
                min-width: 60px;
            }

            .state-item .value {
                color: var(--md-sys-color-on-surface);
                font-family: var(--monospace-font, monospace);
                padding: 4px 8px;
                background-color: var(--md-sys-color-surface-container-high);
                border-radius: 4px;
            }

            .state-item.error .value {
                background-color: color-mix(in srgb, var(--md-sys-color-error) 12%, transparent);
                color: var(--md-sys-color-error);
            }
        `,
    ];
}

// Register this component for cluster ID 97
registerClusterCommands(CLUSTER_ID, "rvc-operational-state-cluster-commands");

declare global {
    interface HTMLElementTagNameMap {
        "rvc-operational-state-cluster-commands": RvcOperationalStateClusterCommands;
    }
}
