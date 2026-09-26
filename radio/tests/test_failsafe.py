import pytest
from flask_socketio import SocketIOTestClient
from pymavlink import mavutil

from .helpers import NoDrone, send_and_receive, set_params
from app.customTypes import VehicleType


# Common parameters for Plane and Copter
FAILSAFE_TEST_PARAMS = [
    ("BATT_LOW_VOLT", 10.5, mavutil.mavlink.MAV_PARAM_TYPE_REAL32),
    ("BATT_LOW_MAH", 1000, mavutil.mavlink.MAV_PARAM_TYPE_REAL32),
    ("BATT_FS_LOW_ACT", 1, mavutil.mavlink.MAV_PARAM_TYPE_UINT8),
    ("BATT_CRT_VOLT", 9.5, mavutil.mavlink.MAV_PARAM_TYPE_REAL32),
    ("BATT_CRT_MAH", 500, mavutil.mavlink.MAV_PARAM_TYPE_REAL32),
    ("BATT_FS_CRT_ACT", 2, mavutil.mavlink.MAV_PARAM_TYPE_UINT8),
]


@pytest.fixture(scope="session", autouse=True)
def setup_failsafe_params():
    """
    Ensure required failsafe parameters exist before tests run.
    """
    set_params(FAILSAFE_TEST_PARAMS)


@pytest.mark.copter_only
def test_getFailsafeConfig(socketio_client: SocketIOTestClient, droneStatus):
    # Failure: wrong state
    droneStatus.state = "params"
    assert send_and_receive("get_failsafe_config") == {
        "message": "You must be on the config screen to access the failsafe configuration."
    }

    # Failure: no drone connected
    droneStatus.state = "config.failsafe"
    with NoDrone():
        assert send_and_receive("get_failsafe_config") == {
            "message": "You must be connected to the drone to access the failsafe configuration."
        }

    # Success: multirotor
    droneStatus.state = "config.failsafe"
    droneStatus.drone.aircraft_type = VehicleType.MULTIROTOR.value

    result = send_and_receive("get_failsafe_config")
    assert "params" in result
    assert "BATT_LOW_VOLT" in result["params"]
    assert "FS_THR_ENABLE" in result["params"]


@pytest.mark.plane_only
def test_getFailsafeConfig_fixedWing(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "config.failsafe"
    droneStatus.drone.aircraft_type = VehicleType.FIXED_WING.value

    result = send_and_receive("get_failsafe_config")
    assert "params" in result
    assert "THR_FS_VALUE" in result["params"]


def test_setFailsafeParam(socketio_client: SocketIOTestClient, droneStatus):
    # Failure: wrong state
    droneStatus.state = "params"
    assert send_and_receive(
        "set_failsafe_config_param",
        {"param_id": "BATT_LOW_VOLT", "value": 11.0},
    ) == {
        "message": "You must be on the config screen to access the failsafe configuration."
    }

    # Failure: no drone connected
    droneStatus.state = "config.failsafe"
    with NoDrone():
        assert send_and_receive(
            "set_failsafe_config_param",
            {"param_id": "BATT_LOW_VOLT", "value": 11.0},
        ) == {
            "message": "You must be connected to the drone to access the failsafe configuration."
        }

    # Failure: missing param_id
    assert send_and_receive(
        "set_failsafe_config_param",
        {"value": 11.0},
    ) == {"message": "Param ID and value must be specified."}

    # Failure: missing value
    assert send_and_receive(
        "set_failsafe_config_param",
        {"param_id": "BATT_LOW_VOLT"},
    ) == {"message": "Param ID and value must be specified."}

    # Success
    result = send_and_receive(
        "set_failsafe_config_param",
        {"param_id": "BATT_LOW_VOLT", "value": 11.0},
    )

    assert result == {
        "success": True,
        "message": "Parameter BATT_LOW_VOLT successfully set to 11.0.",
        "param_id": "BATT_LOW_VOLT",
        "value": 11.0,
    }

    # Failure: invalid param
    result = send_and_receive(
        "set_failsafe_config_param",
        {"param_id": "INVALID_PARAM", "value": 1},
    )

    assert result["success"] is False
    assert "Failed to set parameter" in result["message"]
