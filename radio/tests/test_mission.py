import json
import os

import pytest
from flask_socketio.test_client import SocketIOTestClient

from .helpers import NoDrone
from .mission_test_files.upload_mission_helper import uploadMission

MISSION_FILES_PATH = os.path.join(
    os.path.dirname(__file__),
    "mission_test_files",
)


@pytest.fixture()
def upload_default_mission():
    """
    Uploads the default mission, fence, and rally files to the drone before running a test.
    """
    # Setup

    # Should be imported after the fixture to ensure the droneStatus is fresh
    import app.droneStatus as droneStatus

    assert droneStatus.drone is not None, "Drone must be connected before running tests"

    droneStatus.drone.is_listening = False

    uploadMission(
        os.path.join(MISSION_FILES_PATH, "default_mission.txt"),
        "mission",
        droneStatus.drone.master,
    )
    uploadMission(
        os.path.join(MISSION_FILES_PATH, "default_fence.txt"),
        "fence",
        droneStatus.drone.master,
    )
    uploadMission(
        os.path.join(MISSION_FILES_PATH, "default_rally.txt"),
        "rally",
        droneStatus.drone.master,
    )

    droneStatus.drone.is_listening = True

    yield  # this is where the testing happens

    # Teardown


@pytest.fixture()
def delete_export_files():
    """
    Deletes the exported mission files after running a test.
    """
    yield  # this is where the testing happens

    # Teardown
    export_files = [
        "exported_mission.txt",
        "exported_fence.txt",
        "exported_rally.txt",
    ]

    for file_name in export_files:
        file_path = os.path.join(MISSION_FILES_PATH, file_name)
        if os.path.exists(file_path):
            os.remove(file_path)


def test_getCurrentMissionAll_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("get_current_mission_all")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"  # Correct name emitted
    assert socketio_result["args"][0] == {
        "message": "You must be on the dashboard or missions screen to get the current mission."
    }


@pytest.mark.usefixtures("upload_default_mission")
def test_getCurrentMissionAll_correctState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"
    socketio_client.emit("get_current_mission_all")
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "current_mission_all"  # Correct name emitted

    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_getCurrentMission_correctState_result.json"
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    assert socketio_result["args"][0] == result_data


def test_getCurrentMissionAll_noDroneConnection(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"

    with NoDrone():
        socketio_client.emit("get_current_mission_all")
        socketio_result = socketio_client.get_received()[0]

        assert socketio_result["name"] == "connection_error"  # Correct name emitted
        assert socketio_result["args"][0] == {
            "message": "Must be connected to the drone to get current mission."
        }


def test_getCurrentMission_wrongState(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "params"
    socketio_client.emit("get_current_mission", {"type": "mission"})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"  # Correct name emitted
    assert socketio_result["args"][0] == {
        "message": "You must be on the dashboard or missions screen to get the current mission."
    }


@pytest.mark.usefixtures("upload_default_mission")
def test_getCurrentMission_correctMission(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    socketio_client.emit("get_current_mission", {"type": "mission"})
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "current_mission"

    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_getCurrentMission_correctMission_result.json"
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    assert socketio_result["args"][0] == result_data


@pytest.mark.usefixtures("upload_default_mission")
def test_getCurrentMission_correctFence(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    socketio_client.emit("get_current_mission", {"type": "fence"})
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "current_mission"

    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_getCurrentMission_correctFence_result.json"
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    assert socketio_result["args"][0] == result_data


@pytest.mark.usefixtures("upload_default_mission")
def test_getCurrentMission_correctRally(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    socketio_client.emit("get_current_mission", {"type": "rally"})
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "current_mission"

    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_getCurrentMission_correctRally_result.json"
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    assert socketio_result["args"][0] == result_data


def test_writeCurrentMission_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "params"
    socketio_client.emit("write_current_mission", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"  # Correct name emitted
    assert socketio_result["args"][0] == {
        "message": "You must be on the missions screen to write the current mission."
    }


def test_writeCurrentMission_uploadMissionSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    with open(
        os.path.join(
            MISSION_FILES_PATH,
            "test_writeCurrentMission_uploadMissionSuccess_data.json",
        ),
        "r",
    ) as f:
        data = json.load(f)

    socketio_client.emit("write_current_mission", data)
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "write_mission_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Mission uploaded successfully",
    }

    # Read back the mission
    socketio_client.emit("get_current_mission", {"type": "mission"})
    read_result = socketio_client.get_received()[-1]
    assert read_result["name"] == "current_mission"

    # Compare items
    written_items = data["items"]
    returned_items = read_result["args"][0]["items"]
    assert written_items == returned_items


def test_writeCurrentMission_uploadFenceSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_writeCurrentMission_uploadFenceSuccess_data.json"
        ),
        "r",
    ) as f:
        data = json.load(f)

    socketio_client.emit("write_current_mission", data)
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "write_mission_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Mission uploaded successfully",
    }

    # Read back the mission
    socketio_client.emit("get_current_mission", {"type": "fence"})
    read_result = socketio_client.get_received()[-1]
    assert read_result["name"] == "current_mission"

    # Compare items
    written_items = data["items"]
    returned_items = read_result["args"][0]["items"]
    assert written_items == returned_items


def test_writeCurrentMission_uploadRallySuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    with open(
        os.path.join(
            MISSION_FILES_PATH, "test_writeCurrentMission_uploadRallySuccess_data.json"
        ),
        "r",
    ) as f:
        data = json.load(f)

    socketio_client.emit("write_current_mission", data)
    socketio_result = socketio_client.get_received()[-1]

    assert socketio_result["name"] == "write_mission_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Mission uploaded successfully",
    }

    # Read back the mission
    socketio_client.emit("get_current_mission", {"type": "rally"})
    read_result = socketio_client.get_received()[-1]
    assert read_result["name"] == "current_mission"

    # Compare items
    written_items = data["items"]
    returned_items = read_result["args"][0]["items"]
    assert written_items == returned_items


def test_writeCurrentMission_incorrectMissionType(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    data = {
        "type": "unknown",
        "items": [],
    }

    socketio_client.emit("write_current_mission", data)
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "write_mission_result"
    assert socketio_result["args"][0] == {
        "success": False,
        "message": "Invalid mission type. Must be 'mission', 'fence', or 'rally', got unknown.",
    }


def test_writeCurrentMission_noWaypoints(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    data = {
        "type": "mission",
        "items": [],
    }

    socketio_client.emit("write_current_mission", data)
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "write_mission_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Cleared mission type 0, no waypoints to upload",
    }


def test_importMissionFromFile_missionImportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    import_file_path = os.path.join(MISSION_FILES_PATH, "default_mission.txt")
    with open(
        os.path.join(
            MISSION_FILES_PATH,
            "test_importMissionFromFile_missionImportSuccess_result.json",
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    socketio_client.emit(
        "import_mission_from_file", {"type": "mission", "file_path": import_file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == result_data


def test_importMissionFromFile_fenceImportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    import_file_path = os.path.join(MISSION_FILES_PATH, "default_fence.txt")
    with open(
        os.path.join(
            MISSION_FILES_PATH,
            "test_importMissionFromFile_fenceImportSuccess_result.json",
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    socketio_client.emit(
        "import_mission_from_file", {"type": "fence", "file_path": import_file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == result_data


def test_importMissionFromFile_rallyImportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    import_file_path = os.path.join(MISSION_FILES_PATH, "default_rally.txt")
    with open(
        os.path.join(
            MISSION_FILES_PATH,
            "test_importMissionFromFile_rallyImportSuccess_result.json",
        ),
        "r",
    ) as f:
        result_data = json.load(f)

    socketio_client.emit(
        "import_mission_from_file", {"type": "rally", "file_path": import_file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == result_data


def test_importMissionFromFile_fileNotFound(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "nonexistent.txt")

    socketio_client.emit(
        "import_mission_from_file", {"type": "mission", "file_path": file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == {
        "success": False,
        "message": f"Waypoint file not found at {file_path}",
    }


def test_importMissionFromFile_incorrectMissionType_rallyWithMission(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "default_mission.txt")

    socketio_client.emit(
        "import_mission_from_file", {"type": "rally", "file_path": file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Could not load the waypoint file. Waypoint command MAV_CMD_NAV_TAKEOFF does not match mission type rally",
    }


def test_importMissionFromFile_incorrectMissionType_fenceWithMission(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "default_mission.txt")

    socketio_client.emit(
        "import_mission_from_file", {"type": "fence", "file_path": file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Could not load the waypoint file. Waypoint command MAV_CMD_NAV_TAKEOFF does not match mission type fence",
    }


def test_importMissionFromFile_incorrectMissionType_rallyWithFence(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "default_fence.txt")

    socketio_client.emit(
        "import_mission_from_file", {"type": "rally", "file_path": file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Could not load the waypoint file. Waypoint command MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION does not match mission type rally",
    }


def test_importMissionFromFile_incorrectMissionType_fenceWithRally(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "default_rally.txt")

    socketio_client.emit(
        "import_mission_from_file", {"type": "fence", "file_path": file_path}
    )
    result = socketio_client.get_received()[-1]

    assert result["name"] == "import_mission_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Could not load the waypoint file. Waypoint command MAV_CMD_NAV_RALLY_POINT does not match mission type fence",
    }


@pytest.mark.usefixtures("delete_export_files")
@pytest.mark.usefixtures("upload_default_mission")
def test_exportMissionToFile_missionExportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    export_file_path = os.path.join(MISSION_FILES_PATH, "exported_mission.txt")

    # Get current mission items
    socketio_client.emit("get_current_mission", {"type": "mission"})
    result = socketio_client.get_received()[-1]
    items = result["args"][0]["items"]

    socketio_client.emit(
        "export_mission_to_file",
        {"type": "mission", "file_path": export_file_path, "items": items},
    )
    export_result = socketio_client.get_received()[-1]

    assert export_result["name"] == "export_mission_result"
    assert export_result["args"][0] == {
        "success": True,
        "message": f"Waypoint file saved 8 points successfully to {export_file_path}",
    }
    assert os.path.exists(export_file_path)
    with (
        open(export_file_path, "r") as f,
        open(
            os.path.join(MISSION_FILES_PATH, "exported_mission_check.txt"),
            "r",
        ) as f_expected,
    ):
        assert f.read() == f_expected.read()


@pytest.mark.usefixtures("delete_export_files")
@pytest.mark.usefixtures("upload_default_mission")
def test_exportMissionToFile_fenceExportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    export_file_path = os.path.join(MISSION_FILES_PATH, "exported_fence.txt")

    # Get current mission items
    socketio_client.emit("get_current_mission", {"type": "fence"})
    result = socketio_client.get_received()[-1]
    items = result["args"][0]["items"]

    socketio_client.emit(
        "export_mission_to_file",
        {"type": "fence", "file_path": export_file_path, "items": items},
    )
    export_result = socketio_client.get_received()[-1]

    assert export_result["name"] == "export_mission_result"
    assert export_result["args"][0] == {
        "success": True,
        "message": f"Waypoint file saved 13 points successfully to {export_file_path}",
    }
    assert os.path.exists(export_file_path)
    with (
        open(export_file_path, "r") as f,
        open(
            os.path.join(MISSION_FILES_PATH, "exported_fence_check.txt"),
            "r",
        ) as f_expected,
    ):
        assert f.read() == f_expected.read()


@pytest.mark.usefixtures("delete_export_files")
@pytest.mark.usefixtures("upload_default_mission")
def test_exportMissionToFile_rallyExportSuccess(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    export_file_path = os.path.join(MISSION_FILES_PATH, "exported_rally.txt")

    # Get current mission items
    socketio_client.emit("get_current_mission", {"type": "rally"})
    result = socketio_client.get_received()[-1]
    items = result["args"][0]["items"]

    socketio_client.emit(
        "export_mission_to_file",
        {"type": "rally", "file_path": export_file_path, "items": items},
    )
    export_result = socketio_client.get_received()[-1]

    assert export_result["name"] == "export_mission_result"
    assert export_result["args"][0] == {
        "success": True,
        "message": f"Waypoint file saved 2 points successfully to {export_file_path}",
    }
    assert os.path.exists(export_file_path)
    with (
        open(export_file_path, "r") as f,
        open(
            os.path.join(MISSION_FILES_PATH, "exported_rally_check.txt"),
            "r",
        ) as f_expected,
    ):
        assert f.read() == f_expected.read()


def test_exportMissionToFile_noWaypoints(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "missions"
    file_path = os.path.join(MISSION_FILES_PATH, "exported_empty.txt")

    socketio_client.emit(
        "export_mission_to_file",
        {"type": "mission", "file_path": file_path, "items": []},
    )
    export_result = socketio_client.get_received()[-1]

    assert export_result["name"] == "export_mission_result"
    assert export_result["args"][0] == {
        "success": False,
        "message": "No waypoints loaded for the mission type of mission",
    }


def test_controlMission_wrongState(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "missions"

    socketio_client.emit("control_mission", {"action": "set_current", "seq": 1})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "params_error"
    assert result["args"][0] == {
        "message": "You must be on the dashboard screen to control a mission."
    }


def test_controlMission_notConnected(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "dashboard"

    with NoDrone():
        socketio_client.emit("control_mission", {"action": "set_current", "seq": 1})
        result = socketio_client.get_received()[-1]

    assert result["name"] == "connection_error"


def test_controlMission_invalidAction(socketio_client: SocketIOTestClient, droneStatus):
    droneStatus.state = "dashboard"

    socketio_client.emit("control_mission", {"action": "not_an_action"})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "params_error"
    assert result["args"][0] == {
        "message": "Invalid action for controlling the mission, got not_an_action."
    }


def test_controlMission_setCurrent_missingSeq(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"

    socketio_client.emit("control_mission", {"action": "set_current"})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "params_error"
    assert result["args"][0] == {
        "message": "No mission item number specified to set as current."
    }


def test_controlMission_setCurrent_negativeSeq(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"

    socketio_client.emit("control_mission", {"action": "set_current", "seq": -1})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "mission_control_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Mission item number must not be negative, got -1",
    }


def test_controlMission_setCurrent_nonIntegerSeq(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"

    socketio_client.emit("control_mission", {"action": "set_current", "seq": "2"})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "mission_control_result"
    assert result["args"][0] == {
        "success": False,
        "message": "Mission item number must be an integer, got 2",
    }


@pytest.mark.usefixtures("upload_default_mission")
def test_controlMission_setCurrent_success(
    socketio_client: SocketIOTestClient, droneStatus
):
    droneStatus.state = "dashboard"

    socketio_client.emit("control_mission", {"action": "set_current", "seq": 2})
    result = socketio_client.get_received()[-1]

    assert result["name"] == "mission_control_result"
    assert result["args"][0] == {
        "success": True,
        "message": "Set current mission item to 2",
    }
