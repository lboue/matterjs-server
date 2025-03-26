import { Bytes, Logger } from "@matter/general";
import { AttributeId, camelize, ClusterId, isObject } from "@matter/main";
import { EndpointNumber } from "@matter/main/types";
import { ClusterModel, FieldValue, ValueModel } from "@matter/model";

const logger = new Logger("ChipToolWebSocketHandler");

/** Convert stringified numbers in hex and normal style to either number or bigint. */
export function parseNumber(number: string): number | bigint {
    const parsed = number.startsWith("0x") ? BigInt(number) : parseInt(number);
    if (typeof parsed === "number" && isNaN(parsed)) {
        throw new Error(`Failed to parse number: ${number}`);
    }
    return parsed;
}

/**
 * Uses the matter.js Model to convert the response data for read, subscribe and invoke into a tag based response
 * including conversion of data types.
 */
export function convertMatterToWebSocketTagBased(
    value: unknown,
    model: ValueModel,
    clusterModel: ClusterModel,
): unknown {
    if (value === null) {
        return null;
    }
    if (Array.isArray(value) && model.type === "list") {
        return value.map(v => convertMatterToWebSocketTagBased(v, model.members[0], clusterModel));
    }
    if (isObject(value) && model.metabase?.name === "struct") {
        const valueKeys = Object.keys(value);
        const result: { [key: string]: any } = {};
        for (const member of model.members) {
            const name = camelize(member.name);
            if (member.name !== undefined && member.id !== undefined && valueKeys.includes(name)) {
                result[member.id] = convertMatterToWebSocketTagBased(value[name], member, clusterModel);
            }
        }
        return result;
    }
    if (isObject(value) && model.metabase?.metatype === "bitmap") {
        let numberValue = 0;

        for (const member of clusterModel.scope.membersOf(model)) {
            const memberValue =
                member.name !== undefined && value[camelize(member.name)]
                    ? value[camelize(member.name)]
                    : member.description !== undefined && value[camelize(member.description)]
                      ? value[camelize(member.description)]
                      : undefined;

            if (!memberValue) {
                continue;
            }
            if (typeof memberValue !== "boolean" && typeof memberValue !== "number") {
                throw new Error("Invalid bitmap value", memberValue);
            }

            const constraintValue = FieldValue.numericValue(member.constraint.value);
            if (constraintValue !== undefined) {
                numberValue |= 1 << constraintValue;
            } else {
                const minBit = FieldValue.numericValue(member.constraint.min) ?? 0;
                numberValue |= typeof memberValue === "boolean" ? 1 : memberValue << minBit;
            }
        }

        return numberValue;
    }

    if (value instanceof Uint8Array && model.metabase?.metatype === "bytes") {
        value = `${Bytes.toBase64(value)}`;
    }

    if (model.metabase?.metatype === "integer") {
        return value;
    }

    return value;
}

/** JSON stringify with BigInt handling if number, if bigger than max int  */
// TODO: needed?
export function toPythonJson(object: object, spaces?: number): string {
    const replacements = new Array<{ from: string; to: string }>();
    let result = JSON.stringify(
        object,
        (_key, value) => {
            if (typeof value === "bigint") {
                if (value > Number.MAX_SAFE_INTEGER) {
                    replacements.push({ from: `":"0x${value.toString(16)}"`, to: `":${value.toString()}` });
                    return `0x${value.toString(16)}`;
                } else {
                    return Number(value);
                }
            }
            return value;
        },
        spaces,
    );
    // Chip JSON is no JS JSON, so we need to replace the hex strings with the correct full number again
    if (replacements.length > 0) {
        replacements.forEach(({ from, to }) => {
            result = result.replaceAll(from, to);
        });
    }

    return result;
}

/** Chip JSON-like data strings can contain long numbers that are not supported by JSON.parse */
// TODO Needed?
function parseChipJSON(json: string) {
    json = json.replace(/: (\d{15,})[,}]/g, (match, number) => {
        const num = BigInt(number);
        if (num > Number.MAX_SAFE_INTEGER) {
            return match.replace(number, `"0x${num.toString(16)}"`);
        }
        return match;
    });

    return JSON.parse(json);
}

/** Use the matter.js model to convert the incoming data for write and invoke commands into the expected format. */
export function convertWebsocketDataToMatter(value: any, model: ValueModel): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === "null" || value === null) {
        return null;
    }

    if (model.type === "list") {
        if (typeof value === "string") {
            value = parseChipJSON(value);
        }
        if (Array.isArray(value)) {
            return value.map(v => convertWebsocketDataToMatter(v, model.members[0]));
        }
    }

    if (model.metabase?.name === "struct") {
        if (typeof value === "string") {
            value = parseChipJSON(value);
        }
        if (typeof value === "object") {
            const members = model.members.reduce(
                (acc, member) => {
                    if (member.name !== undefined) {
                        acc[member.name.toLowerCase()] = member;
                    }
                    return acc;
                },
                {} as { [key: string]: ValueModel },
            );
            const valueKeys = Object.keys(value);
            const result: { [key: string]: unknown } = {};
            valueKeys.forEach(key => {
                const member = members[camelize(key).toLowerCase()];
                if (member !== undefined) {
                    result[camelize(member.name)] = convertWebsocketDataToMatter(value[key], member);
                }
            });
            return result;
        }
    }

    if (typeof value === "number" && (model.metabase?.metatype === "integer" || model.metabase?.metatype === "enum")) {
        return value;
    }

    if (typeof value === "string") {
        if (model.metabase?.metatype === "bytes" && value.startsWith("hex:")) {
            return Bytes.fromHex(value.slice(4));
        }

        if (model.metabase?.metatype === "bitmap") {
            const numberValue = parseInt(value);
            if (isNaN(numberValue)) {
                throw new Error("Invalid bitmap value");
            }
            const bitmapValue: { [key: string]: boolean } = {};
            model.members.forEach(member => {
                if (
                    member.constraint !== undefined &&
                    member.name !== undefined &&
                    numberValue & (1 << parseInt(member.constraint as unknown as string))
                ) {
                    bitmapValue[camelize(member.name)] = true;
                }
            });
            return bitmapValue;
        }

        if (
            ((model.metabase?.metatype === "integer" || model.metabase?.metatype === "enum") &&
                value.startsWith("0x") &&
                value.match(/^0x[\da-fA-F]+$/)) ||
            value.match(/^-?[1-9]\d*$/) ||
            value === "0"
        ) {
            return parseNumber(value);
        }

        if (model.metabase?.metatype === "boolean") {
            return value === "true" || value === "1" || value === "True";
        }

        if (model.metabase?.metatype === "string") {
            return value;
        }
    }

    logger.warn("UNHANDLED value ...", value, model.type, model.metatype, model.metabase?.metatype);

    return value;
}

export function getDateAsString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
    const microseconds = "000"; // JavaScript Date object does not support microseconds

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${microseconds}`;
}

export function bytesToMac(bytes: Uint8Array): string {
    return Bytes.toHex(bytes)
        .match(/.{1,2}/g)!
        .join(":");
}

export function bytesToIpV4(bytes: Uint8Array): string {
    return Array.from(bytes).join(".");
}

export function bytesToIpV6(bytes: Uint8Array): string {
    // Convert the byte array to an array of 8 groups of 16-bit numbers
    let groups = [];
    for (let i = 0; i < 16; i += 2) {
        groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    }

    // Join the groups with colons
    let ipv6 = groups.join(":");

    // Compress the longest sequence of zeroes using "::"
    return ipv6.replace(/(?:^|:)0(:0)*(:|$)/, "::");
}

export function buildAttributePath(endpointId: number, clusterId: number, attributeId: number): string {
    return `${endpointId}/${clusterId}/${attributeId}`;
}

export function splitAttributePath(path: string): {
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
} {
    const [endpointId, clusterId, attributeId] = path.split("/").map(Number);
    return {
        endpointId: EndpointNumber(endpointId),
        clusterId: ClusterId(clusterId),
        attributeId: AttributeId(attributeId),
    };
}
