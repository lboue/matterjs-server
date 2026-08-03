/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import {
    COMMODITY_TARIFF_CLUSTER_ID,
    commodityTariffInfo,
    formatEpochTime,
    formatMinutesOfDay,
    type ScheduleRow,
    type TariffComponentInfo,
    type TariffRange,
} from "../../../util/commodity-tariff.js";
import { BaseClusterCommands } from "../base-cluster-commands.js";
import { registerClusterCommands } from "../registry.js";

const FEATURE_LABELS: [
    key: "pricing" | "friendlyCredit" | "auxiliaryLoad" | "peakPeriod" | "powerThreshold" | "randomization",
    text: string,
][] = [
    ["pricing", "Pricing"],
    ["friendlyCredit", "Friendly Credit"],
    ["auxiliaryLoad", "Auxiliary Load"],
    ["peakPeriod", "Peak Period"],
    ["powerThreshold", "Power Threshold"],
    ["randomization", "Randomization"],
];

/**
 * Read-only decoding panel for the CommodityTariff cluster (ID: 0x700 / 1792).
 */
@customElement("commodity-tariff-cluster-commands")
export class CommodityTariffClusterCommands extends BaseClusterCommands {
    override render() {
        if (!this.node || this.cluster !== COMMODITY_TARIFF_CLUSTER_ID) return nothing;
        const info = commodityTariffInfo(this.node.attributes, this.endpoint);
        if (!info.supported) return nothing;

        const features = FEATURE_LABELS.filter(([key]) => info.features[key]).map(([, text]) => text);

        return html`
            <details class="command-panel" open>
                <summary>Commodity Tariff</summary>
                <div class="command-content">
                    ${
                        info.tariffInfo?.label || info.tariffInfo?.providerName
                            ? html`<p class="tariff-header">
                                  ${info.tariffInfo.label ? html`<b>${info.tariffInfo.label}</b>` : nothing}
                                  ${info.tariffInfo.providerName ? html` — ${info.tariffInfo.providerName}` : nothing}
                              </p>`
                            : nothing
                    }

                    <div class="now-next">
                        ${this._renderPriceLine("current", info.currentComponent, info.currentRange)}
                        ${this._renderPriceLine("next", info.nextComponent, info.nextRange)}
                    </div>

                    ${
                        info.todaySchedule.length > 0
                            ? html`<details class="schedule">
                                  <summary>Today's schedule</summary>
                                  ${this._renderScheduleTable(info.todaySchedule)}
                              </details>`
                            : nothing
                    }
                    ${
                        info.tomorrowSchedule.length > 0
                            ? html`<details class="schedule">
                                  <summary>Tomorrow's schedule</summary>
                                  ${this._renderScheduleTable(info.tomorrowSchedule)}
                              </details>`
                            : nothing
                    }

                    <dl class="info-grid">
                        ${
                            info.startDate !== undefined
                                ? html`<dt>Valid since</dt>
                                      <dd>${formatEpochTime(info.startDate)}</dd>`
                                : nothing
                        }
                        ${
                            info.tariffUnit
                                ? html`<dt>Unit</dt>
                                      <dd>${info.tariffUnit}</dd>`
                                : nothing
                        }
                        ${
                            info.tariffInfo?.blockMode
                                ? html`<dt>Block mode</dt>
                                      <dd title=${info.tariffInfo.blockModeDescription ?? nothing}>
                                          ${info.tariffInfo.blockMode}
                                      </dd>`
                                : nothing
                        }
                        ${
                            features.length > 0
                                ? html`<dt>Features</dt>
                                      <dd>${features.join(", ")}</dd>`
                                : nothing
                        }
                    </dl>
                </div>
            </details>
        `;
    }

    private _renderPriceLine(
        kind: "current" | "next",
        component: TariffComponentInfo | undefined,
        range: TariffRange | undefined,
    ): TemplateResult {
        if (!component && !range) return html``;
        const text = component?.label ?? component?.price?.priceType ?? "Unknown period";
        const amount = component?.price?.amount;
        const rangeText = range
            ? range.end !== undefined
                ? html`${formatEpochTime(range.start)}–${formatEpochTime(range.end)}`
                : html`from ${formatEpochTime(range.start)}`
            : nothing;
        return html`
            <div class="tariff-row ${kind}">
                <span class="tag">${kind === "current" ? "Now" : "Next"}</span>
                <span class="text">${text}${amount ? html` — ${amount}` : nothing}</span>
                <span class="range">${rangeText}</span>
            </div>
        `;
    }

    private _renderScheduleTable(rows: ScheduleRow[]): TemplateResult {
        return html`
            <table class="tariff-schedule">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Period</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(
                        row => html`
                            <tr>
                                <td>${formatMinutesOfDay(row.startMinutes)}–${formatMinutesOfDay(row.endMinutes)}</td>
                                <td>${row.label ?? "—"}</td>
                                <td>${row.price?.amount ?? "—"}</td>
                            </tr>
                        `,
                    )}
                </tbody>
            </table>
        `;
    }

    static override styles: CSSResultGroup = [
        BaseClusterCommands.styles,
        css`
            .command-content {
                font-size: 14px;
            }
            .tariff-header {
                margin: 0 0 12px 0;
                color: var(--text-color, rgba(0, 0, 0, 0.6));
            }
            .now-next {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 12px;
            }
            .tariff-row {
                display: flex;
                align-items: baseline;
                gap: 8px;
            }
            .tariff-row.current {
                font-weight: 700;
            }
            .tariff-row .tag {
                min-width: 40px;
                text-transform: uppercase;
                opacity: 0.6;
                font-weight: 500;
            }
            .tariff-row .range {
                color: var(--text-color, rgba(0, 0, 0, 0.6));
                font-weight: 400;
            }
            details.schedule {
                margin-bottom: 12px;
            }
            details.schedule summary {
                cursor: pointer;
                color: var(--md-sys-color-primary);
            }
            .tariff-schedule {
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
            }
            .tariff-schedule th {
                text-align: left;
                text-transform: uppercase;
                opacity: 0.6;
                padding: 6px 10px;
                border-bottom: 1px solid var(--md-sys-color-outline-variant);
            }
            .tariff-schedule td {
                padding: 6px 10px;
                border-bottom: 1px solid var(--md-sys-color-outline-variant);
            }
            .info-grid {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 6px 16px;
                margin: 0;
            }
            .info-grid dt {
                color: var(--text-color, rgba(0, 0, 0, 0.6));
            }
            .info-grid dd {
                margin: 0;
                font-weight: 500;
            }
        `,
    ];
}

registerClusterCommands(COMMODITY_TARIFF_CLUSTER_ID, "commodity-tariff-cluster-commands");

declare global {
    interface HTMLElementTagNameMap {
        "commodity-tariff-cluster-commands": CommodityTariffClusterCommands;
    }
}
