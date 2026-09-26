import pytest
from flask_socketio.test_client import SocketIOTestClient
from pymavlink.mavutil import mavlink

from .helpers import NoDrone, set_params


@pytest.fixture(scope="session", autouse=True)
def setup_function():
    """
    Setup parameters before all tests run
    """

    params = [
        ("FLTMODE1", 7, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE2", 9, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE3", 6, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE4", 3, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE5", 5, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE6", 0, mavlink.MAV_PARAM_TYPE_UINT8),
        ("FLTMODE_CH", 6, mavlink.MAV_PARAM_TYPE_UINT8),
    ]

    set_params(params)

    from app import droneStatus

    droneStatus.drone.flightModesController.refreshData()  # Refresh flight mode data


@pytest.fixture(scope="module", autouse=True)
def run_once_after_all_tests():
    """
    Sets the flight mode back to default after testing to ensure arm tests do not fail
    """
    from app import droneStatus

    # Use pymavlink to set the current flight mode to 0 after tests
    drone = droneStatus.drone
    drone.master.set_mode(0)


def test_getFlightModeConfig_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("get_flight_mode_config")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the config screen to access the flight modes."
    }


def test_getFlightModeConfig_correctState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("get_flight_mode_config")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "flight_mode_config"
    assert socketio_result["args"][0] == {
        "flight_modes": [7, 9, 6, 3, 5, 0],
        "flight_mode_channel": 6,
    }


def test_setFlightModeConfig_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("set_flight_mode", {"mode_number": 1, "flight_mode": 7})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the config screen to access the flight modes."
    }


def test_setFlightMode_missingFlightMode(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode", {"mode_number": 1})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {
        "message": "Mode number and flight mode must be specified.",
    }


def test_setFlightMode_missingModeNumber(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode", {"flight_mode": 1})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {
        "message": "Mode number and flight mode must be specified.",
    }


def test_setFlightMode_missingData(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {
        "message": "Mode number and flight mode must be specified.",
    }


def test_setFlightMode_wrongModeNumber(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode", {"mode_number": 0, "flight_mode": 9})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "set_flight_mode_result"
    assert socketio_result["args"][0] == {
        "success": False,
        "message": "Invalid flight mode number, must be between 1 and 6 inclusive, got 0.",
    }


@pytest.mark.copter_only
def test_setFlightMode_successfullySet(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode", {"mode_number": 1, "flight_mode": 7})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "set_flight_mode_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Flight mode 1 set to COPTER_MODE_CIRCLE",
        "data": {"param_id": "FLTMODE1", "value": 7},
    }
    assert droneStatus.drone.flightModesController.flight_modes == [7, 9, 6, 3, 5, 0]


def test_setFlightModeChannel_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("set_flight_mode_channel", {"channel": 5})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the config screen to access the flight modes."
    }


def test_setFlightModeChannel_missingData(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode_channel", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {
        "message": "Flight mode channel must be specified.",
    }


def test_setFlightModeChannel_invalidType(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_flight_mode_channel", {"channel": "invalid"})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {
        "message": "Flight mode channel must be an integer.",
    }


def test_setFlightModeChannel_successfullySet(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    original_channel = droneStatus.drone.flightModesController.flight_mode_channel

    socketio_client.emit("set_flight_mode_channel", {"channel": 5})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "set_flight_mode_channel_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Flight mode channel set to 5",
        "data": {"param_id": "FLTMODE_CH", "value": 5},
    }
    assert droneStatus.drone.flightModesController.flight_mode_channel == 5

    # Reset back to original
    socketio_client.emit("set_flight_mode_channel", {"channel": original_channel})
    socketio_client.get_received()[0]


def test_refreshFlightModeData_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("refresh_flight_mode_data")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the config screen to access the flight modes."
    }


def test_refreshFlightModeData_success(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("refresh_flight_mode_data")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "flight_mode_config"


def test_setCurrentFlightMode_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "config.flight_modes"
    socketio_client.emit("set_current_flight_mode", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the dashboard screen to set the current flight mode."
    }


def test_setCurrentFlightMode_missingData(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"
    socketio_client.emit("set_current_flight_mode", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "drone_error"
    assert socketio_result["args"][0] == {"message": "Flight mode must be specified."}


def test_setCurrentFlightMode_successfullySet(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"
    socketio_client.emit("set_current_flight_mode", {"newFlightMode": 7})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "set_current_flight_mode_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Flight mode set successfully",
    }


def test_flightModeEndpoints_noDrone(socketio_client: SocketIOTestClient, droneStatus):
    with NoDrone():
        # Test get flight mode config
        droneStatus.state = "config.flight_modes"
        socketio_client.emit("get_flight_mode_config")
        result = socketio_client.get_received()[0]
        assert result["name"] == "connection_error"
        assert (
            result["args"][0]["message"]
            == "Must be connected to the drone to get the flight mode config."
        )

        # Test set flight mode
        socketio_client.emit("set_flight_mode", {"mode_number": 1, "flight_mode": 4})
        result = socketio_client.get_received()[0]
        assert result["name"] == "connection_error"
        assert (
            result["args"][0]["message"]
            == "Must be connected to the drone to set the flight mode."
        )

        # Test set flight mode channel
        socketio_client.emit("set_flight_mode_channel", {"channel": 8})
        result = socketio_client.get_received()[0]
        assert result["name"] == "connection_error"
        assert (
            result["args"][0]["message"]
            == "Must be connected to the drone to set the flight mode channel."
        )

        # Test refresh flight mode
        socketio_client.emit("refresh_flight_mode_data")
        result = socketio_client.get_received()[0]
        assert result["name"] == "connection_error"
        assert (
            result["args"][0]["message"]
            == "Must be connected to the drone to refresh the flight mode data."
        )

        # Test set current flight mode
        droneStatus.state = "dashboard"
        socketio_client.emit("set_current_flight_mode", {"newFlightMode": 1})
        result = socketio_client.get_received()[0]
        assert result["name"] == "connection_error"
        assert (
            result["args"][0]["message"]
            == "Must be connected to the drone to set the current flight mode."
        )
