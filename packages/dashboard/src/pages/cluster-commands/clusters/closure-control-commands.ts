/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import "@material/web/button/outlined-button";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { handleAsync } from "../../../util/async-handler.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

const CLUSTER_ID = 260; // ClosureControl cluster
const ACCEPTED_COMMAND_LIST_ATTR = 0xfff9;
const FEATURE_MAP_ATTR = 0xfffc;

const STOP_COMMAND_ID = 0;
const MOVE_TO_COMMAND_ID = 1;
const CALIBRATE_COMMAND_ID = 2;

const FEATURE_POSITIONING = 0;
const FEATURE_LATCHING = 1;
const FEATURE_INSTANTANEOUS = 2;
const FEATURE_SPEED = 3;
const FEATURE_CALIBRATION = 6;

/**
 * Command panel for ClosureControl cluster (ID: 260).
 * Provides Stop, MoveTo, and Calibrate commands.
 */
@customElement("closure-control-cluster-commands")
class ClosureControlClusterCommands extends BaseClusterCommands {
    @state()
    private _includePosition = true;

    @state()
    private _position = 1;

    @state()
    private _includeLatch = false;

    @state()
    private _latch = false;

    @state()
    private _includeSpeed = false;

    @state()
    private _speed = 0;

    override render() {
        const supportsPositionRaw = this._supportsFeature(FEATURE_POSITIONING, true);
        const supportsLatchRaw = this._supportsFeature(FEATURE_LATCHING, true);
        const supportsSpeedRaw = this._supportsFeature(FEATURE_SPEED, true);
        const supportsInstantaneous = this._supportsFeature(FEATURE_INSTANTANEOUS, false);
        const supportsStop = this._supportsCommand(STOP_COMMAND_ID, !supportsInstantaneous);
        const supportsMoveTo = this._supportsCommand(MOVE_TO_COMMAND_ID, true);
        const supportsCalibrate = this._supportsCommand(
            CALIBRATE_COMMAND_ID,
            this._supportsFeature(FEATURE_CALIBRATION, false),
        );

        // MoveTo requires at least one argument; some devices expose partial feature metadata.
        // Keep Position available as a safe fallback when MoveTo is supported but no fields are advertised.
        const hasAnyMoveToField = supportsPositionRaw || supportsLatchRaw || supportsSpeedRaw;
        const supportsPosition = supportsPositionRaw || (supportsMoveTo && !hasAnyMoveToField);
        const supportsLatch = supportsLatchRaw;
        const supportsSpeed = supportsSpeedRaw;

        const includePosition = supportsPosition && this._includePosition;
        const includeLatch = supportsLatch && this._includeLatch;
        const includeSpeed = supportsSpeed && this._includeSpeed;
        const moveToDisabled = !supportsMoveTo || (!includePosition && !includeLatch && !includeSpeed);

        return html`
            <details class="command-panel">
                <summary>Closure Control Commands</summary>
                <div class="command-content">
                    <div class="command-row">
                        <md-outlined-button ?disabled=${!supportsStop} @click=${handleAsync(() => this._handleStop())}>
                            Stop
                        </md-outlined-button>
                        <md-outlined-button
                            ?disabled=${!supportsCalibrate}
                            @click=${handleAsync(() => this._handleCalibrate())}
                        >
                            Calibrate
                        </md-outlined-button>
                    </div>
                    <div class="command-row">
                        ${supportsPosition
                            ? html`
                                  <label for="includePosition">
                                      <input
                                          id="includePosition"
                                          type="checkbox"
                                          .checked=${this._includePosition}
                                          @change=${this._handleIncludePositionChange}
                                      />
                                      Position
                                  </label>
                                  <input
                                      id="position"
                                      type="number"
                                      min="0"
                                      max="4"
                                      .value=${String(this._position)}
                                      ?disabled=${!this._includePosition}
                                      @input=${this._handlePositionChange}
                                  />
                              `
                            : html``}
                        ${supportsLatch
                            ? html`
                                  <label for="includeLatch">
                                      <input
                                          id="includeLatch"
                                          type="checkbox"
                                          .checked=${this._includeLatch}
                                          @change=${this._handleIncludeLatchChange}
                                      />
                                      Latch
                                  </label>
                                  <label for="latch">
                                      <input
                                          id="latch"
                                          type="checkbox"
                                          .checked=${this._latch}
                                          ?disabled=${!this._includeLatch}
                                          @change=${this._handleLatchChange}
                                      />
                                      Latched
                                  </label>
                              `
                            : html``}
                        ${supportsSpeed
                            ? html`
                                  <label for="includeSpeed">
                                      <input
                                          id="includeSpeed"
                                          type="checkbox"
                                          .checked=${this._includeSpeed}
                                          @change=${this._handleIncludeSpeedChange}
                                      />
                                      Speed
                                  </label>
                                  <input
                                      id="speed"
                                      type="number"
                                      min="0"
                                      max="3"
                                      .value=${String(this._speed)}
                                      ?disabled=${!this._includeSpeed}
                                      @input=${this._handleSpeedChange}
                                  />
                              `
                            : html``}
                        <md-outlined-button
                            ?disabled=${moveToDisabled}
                            @click=${handleAsync(() => this._handleMoveTo())}
                        >
                            MoveTo
                        </md-outlined-button>
                    </div>
                    <div class="command-row">
                        <small>
                            Position: 0=FullyClosed, 1=FullyOpen, 2=Pedestrian, 3=Ventilation, 4=Signature. Speed:
                            0=Auto, 1=Low, 2=Medium, 3=High.
                        </small>
                    </div>
                    ${!supportsStop || !supportsCalibrate || !supportsMoveTo
                        ? html`
                              <div class="command-row">
                                  <small>
                                      Some commands are disabled because this endpoint does not advertise support for
                                      them.
                                  </small>
                              </div>
                          `
                        : html``}
                </div>
            </details>
        `;
    }

    private _handleIncludePositionChange(e: Event) {
        this._includePosition = (e.target as HTMLInputElement).checked;
    }

    private _handlePositionChange(e: Event) {
        const input = e.target as HTMLInputElement;
        let value = Number.parseInt(input.value, 10);
        if (Number.isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 4) value = 4;
        this._position = value;
    }

    private _handleIncludeLatchChange(e: Event) {
        this._includeLatch = (e.target as HTMLInputElement).checked;
    }

    private _handleLatchChange(e: Event) {
        this._latch = (e.target as HTMLInputElement).checked;
    }

    private _handleIncludeSpeedChange(e: Event) {
        this._includeSpeed = (e.target as HTMLInputElement).checked;
    }

    private _handleSpeedChange(e: Event) {
        const input = e.target as HTMLInputElement;
        let value = Number.parseInt(input.value, 10);
        if (Number.isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 3) value = 3;
        this._speed = value;
    }

    private async _handleStop() {
        await this.sendCommand("Stop");
    }

    private async _handleCalibrate() {
        await this.sendCommand("Calibrate");
    }

    private async _handleMoveTo() {
        const supportsMoveTo = this._supportsCommand(MOVE_TO_COMMAND_ID, true);
        const supportsPositionRaw = this._supportsFeature(FEATURE_POSITIONING, true);
        const supportsLatch = this._supportsFeature(FEATURE_LATCHING, true);
        const supportsSpeed = this._supportsFeature(FEATURE_SPEED, true);
        const supportsPosition =
            supportsPositionRaw || (supportsMoveTo && !supportsPositionRaw && !supportsLatch && !supportsSpeed);
        const payload: Record<string, unknown> = {};
        if (supportsPosition && this._includePosition) payload.position = this._position;
        if (supportsLatch && this._includeLatch) payload.latch = this._latch;
        if (supportsSpeed && this._includeSpeed) payload.speed = this._speed;

        if (Object.keys(payload).length === 0) return;
        await this.sendCommand("MoveTo", payload);
    }

    private _supportsCommand(commandId: number, fallback: boolean): boolean {
        const accepted = this._readAcceptedCommandSet();
        if (accepted === null) return fallback;
        return accepted.has(commandId);
    }

    private _supportsFeature(bit: number, fallback: boolean): boolean {
        const featureMap = this._readFeatureMap();
        if (featureMap === null) return fallback;
        return (featureMap & (1n << BigInt(bit))) !== 0n;
    }

    private _readAcceptedCommandSet(): Set<number> | null {
        const key = `${this.endpoint}/${this.cluster}/${ACCEPTED_COMMAND_LIST_ATTR}`;
        const raw = this.node?.attributes[key];
        if (!Array.isArray(raw)) return null;

        const accepted = new Set<number>();
        for (const entry of raw) {
            const parsed = this._toFiniteNumber(entry);
            if (parsed !== null) accepted.add(parsed);
        }
        return accepted.size > 0 ? accepted : null;
    }

    private _readFeatureMap(): bigint | null {
        const key = `${this.endpoint}/${this.cluster}/${FEATURE_MAP_ATTR}`;
        const raw = this.node?.attributes[key];
        if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(raw);
        if (typeof raw === "bigint") return raw;
        if (typeof raw === "string") {
            try {
                const value = raw.startsWith("0x") || raw.startsWith("0X") ? BigInt(raw) : BigInt(raw.trim());
                return value >= 0n ? value : null;
            } catch {
                return null;
            }
        }
        return null;
    }

    private _toFiniteNumber(value: unknown): number | null {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "bigint") {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }
        if (typeof value === "string" && value.trim() !== "") {
            const n = Number(value.trim());
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }
}

registerClusterCommands(CLUSTER_ID, "closure-control-cluster-commands");

declare global {
    interface HTMLElementTagNameMap {
        "closure-control-cluster-commands": ClosureControlClusterCommands;
    }
}
