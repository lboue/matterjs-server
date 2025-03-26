import { ClusterId } from "@matter/main";
import {
    AcceptedCommandList,
    AttributeList,
    AttributeModel,
    ClusterModel,
    ClusterRevision,
    CommandModel,
    EventModel,
    FeatureMap,
    GeneratedCommandList,
    MatterModel,
} from "@matter/model";

type AttributeDetails = { [key: string]: AttributeModel };

/** Metadata for Global attributes */
export const GlobalAttributes: AttributeDetails = {
    clusterRevision: ClusterRevision,
    featureMap: FeatureMap,
    attributeList: AttributeList,
    acceptedCommandList: AcceptedCommandList,
    generatedCommandList: GeneratedCommandList,
};

/**
 * Metadata for all clusters collected in an optimized form for direct access with the incoming websocket requests.
 * All names are just lowercased to prevent differences in camelize and decamelize handling.
 */
export type ClusterMapEntry = {
    clusterId: ClusterId;
    model: ClusterModel;
    commands: { [key: string]: CommandModel };
    attributes: AttributeDetails;
    events: { [key: string]: EventModel };
};
export const ClusterMap: {
    [key: string]: ClusterMapEntry;
} = {};

// Remap the clusters from Model  to a more optimized form for direct access
MatterModel.standard.clusters.forEach(cluster => {
    const aces = cluster.allAces;
    const clusterData: ClusterMapEntry = {
        clusterId: ClusterId(cluster.id),
        model: cluster,
        commands: {},
        attributes: {},
        events: {},
    };
    aces.forEach(ace => {
        const name = ace.name.toLowerCase();
        if (ace instanceof CommandModel) {
            clusterData.commands[name] = ace;
            clusterData.commands[ace.id] = ace;
        } else if (ace instanceof AttributeModel) {
            clusterData.attributes[name] = ace;
            clusterData.attributes[ace.id] = ace;
        } else if (ace instanceof EventModel) {
            clusterData.events[name] = ace;
            clusterData.events[ace.id] = ace;
        }
    });
    ClusterMap[cluster.name.toLowerCase()] = clusterData;
});
