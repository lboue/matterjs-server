"""Tests for MatterNode/MatterEndpoint bridge and compose parent resolution."""

from __future__ import annotations

from matter_server.client.models.node import MatterNode
from matter_server.common.helpers.util import dataclass_from_dict
from matter_server.common.models import MatterNodeData

# Descriptor cluster id and attribute ids
_DESCRIPTOR = 29
_DEVICE_TYPE_LIST = 0
_PARTS_LIST = 3

# device type ids used below
_ROOT_NODE = 22
_AGGREGATOR = 14
_BRIDGED_NODE = 19
_ON_OFF_LIGHT = 256


def _node_with_endpoints(endpoints: dict[int, dict[int, object]]) -> MatterNode:
    """Build a MatterNode from a minimal per-endpoint Descriptor attribute map."""
    attributes: dict[str, object] = {}
    for endpoint_id, endpoint_attrs in endpoints.items():
        for attribute_id, value in endpoint_attrs.items():
            attributes[f"{endpoint_id}/{_DESCRIPTOR}/{attribute_id}"] = value
    return MatterNode(
        dataclass_from_dict(
            MatterNodeData,
            {
                "node_id": 1,
                "date_commissioned": "2026-01-01T00:00:00",
                "last_interview": "2026-01-01T00:00:00",
                "interview_version": 1,
                "available": True,
                "is_bridge": True,
                "attributes": attributes,
                "attribute_subscriptions": [],
            },
        )
    )


def test_nested_aggregator_children_resolve_bridge_parent() -> None:
    """A device type list nested under an Aggregator resolves get_bridge_parent().

    Matterbridge's demo devices expose exactly this topology: an Aggregator
    endpoint that is itself a bridged device (Aggregator + BridgedNode on the
    same endpoint), with its own further bridged children that carry no
    BridgedNode of their own.
    """
    node = _node_with_endpoints(
        {
            0: {
                _DEVICE_TYPE_LIST: [{"0": _ROOT_NODE, "1": 1}],
            },
            1: {
                _DEVICE_TYPE_LIST: [{"0": _AGGREGATOR, "1": 1}],
                _PARTS_LIST: [100],
            },
            100: {
                _DEVICE_TYPE_LIST: [
                    {"0": _AGGREGATOR, "1": 1},
                    {"0": _BRIDGED_NODE, "1": 1},
                ],
                _PARTS_LIST: [101, 102],
            },
            101: {_DEVICE_TYPE_LIST: [{"0": _ON_OFF_LIGHT, "1": 1}]},
            102: {_DEVICE_TYPE_LIST: [{"0": _ON_OFF_LIGHT, "1": 1}]},
        }
    )

    aggregator = node.endpoints[100]
    child_a = node.endpoints[101]
    child_b = node.endpoints[102]

    assert aggregator.is_bridged_device
    assert node.get_bridge_parent(100) is node.endpoints[1]

    for child in (child_a, child_b):
        assert child.is_bridged_device
        assert node.get_bridge_parent(child.endpoint_id) is aggregator
        # the children are independent devices, not sub-parts of the aggregator
        assert node.get_compose_parent(child.endpoint_id) is None
        assert not child.is_composed_device


def test_top_level_bridged_device_is_unaffected() -> None:
    """A plain top-level bridged device (no nesting) keeps working as before."""
    node = _node_with_endpoints(
        {
            0: {_DEVICE_TYPE_LIST: [{"0": _ROOT_NODE, "1": 1}]},
            1: {
                _DEVICE_TYPE_LIST: [{"0": _AGGREGATOR, "1": 1}],
                _PARTS_LIST: [29],
            },
            29: {
                _DEVICE_TYPE_LIST: [
                    {"0": _ON_OFF_LIGHT, "1": 1},
                    {"0": _BRIDGED_NODE, "1": 1},
                ],
            },
        }
    )

    bridged = node.endpoints[29]

    assert bridged.is_bridged_device
    assert node.get_bridge_parent(29) is node.endpoints[1]
    assert node.get_compose_parent(29) is None
