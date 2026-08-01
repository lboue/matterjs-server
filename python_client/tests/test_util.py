"""Tests for matter_server.common.helpers.util."""

from __future__ import annotations

from chip.clusters import Objects as clusters
from chip.clusters.Types import NullValue
from matter_server.common.helpers.util import dataclass_to_dict, dataclass_to_tag_dict


def test_dataclass_to_tag_dict_uses_tlv_tags() -> None:
    """dataclass_to_tag_dict must key struct fields by their TLV tag, not field name.

    WRITE_ATTRIBUTE expects the same tag-keyed struct format already used for
    attribute reports. Sending field-name keys instead (as plain
    dataclasses.asdict()/dataclass_to_dict() would) causes the receiving
    matter-server to fail mapping fields like `presetHandle`, leaving binary
    handle fields as un-decoded base64 strings and the write rejected with
    INVALID_DATA_TYPE.
    """
    preset = clusters.Thermostat.Structs.PresetStruct(
        presetHandle=b"\x01",
        presetScenario=clusters.Thermostat.Enums.PresetScenarioEnum.kOccupied,
        name=None,
        coolingSetpoint=2500,
        heatingSetpoint=2100,
        builtIn=True,
    )

    result = dataclass_to_tag_dict(preset)

    assert result == {
        "0": b"\x01",
        "1": clusters.Thermostat.Enums.PresetScenarioEnum.kOccupied,
        "2": None,
        "3": 2500,
        "4": 2100,
        "5": True,
    }


def test_dataclass_to_tag_dict_is_recursive_through_lists() -> None:
    """Nested dataclasses inside lists (e.g. Schedule.transitions) must also convert."""
    schedule = clusters.Thermostat.Structs.ScheduleStruct(
        scheduleHandle=NullValue,
        systemMode=clusters.Thermostat.Enums.SystemModeEnum.kHeat,
        name="Weekdays",
        presetHandle=None,
        transitions=[
            clusters.Thermostat.Structs.ScheduleTransitionStruct(
                dayOfWeek=clusters.Thermostat.Bitmaps.ScheduleDayOfWeekBitmap.kMonday,
                transitionTime=420,
                heatingSetpoint=2100,
            )
        ],
        builtIn=False,
    )

    result = dataclass_to_tag_dict(schedule)

    assert result["0"] is NullValue  # scheduleHandle, passed through unchanged
    assert result["1"] == clusters.Thermostat.Enums.SystemModeEnum.kHeat
    assert result["2"] == "Weekdays"
    assert isinstance(result["4"], list)
    transition = result["4"][0]
    assert transition == {
        "0": clusters.Thermostat.Bitmaps.ScheduleDayOfWeekBitmap.kMonday,
        "1": 420,
        "2": None,
        "3": None,
        "4": None,
        "5": 2100,
    }


def test_dataclass_to_tag_dict_passes_through_scalars() -> None:
    """Non-dataclass values (the common case for simple attributes) are untouched."""
    assert dataclass_to_tag_dict(2000) == 2000
    assert dataclass_to_tag_dict("Integration Test Node") == "Integration Test Node"
    assert dataclass_to_tag_dict(None) is None


def test_dataclass_to_dict_still_uses_field_names() -> None:
    """dataclass_to_dict (used for DEVICE_COMMAND payloads) is unaffected by this change."""
    preset = clusters.Thermostat.Structs.PresetStruct(
        presetHandle=b"\x01",
        presetScenario=clusters.Thermostat.Enums.PresetScenarioEnum.kOccupied,
        name=None,
        coolingSetpoint=2500,
        heatingSetpoint=2100,
        builtIn=True,
    )

    result = dataclass_to_dict(preset)

    assert result["presetHandle"] == b"\x01"
    assert result["presetScenario"] == clusters.Thermostat.Enums.PresetScenarioEnum.kOccupied
