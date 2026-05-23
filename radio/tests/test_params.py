import os
import time
from typing import Any, List, Optional, Union

import pytest
from flask_socketio.test_client import SocketIOTestClient
from pymavlink.mavutil import mavlink

from .helpers import ParamRefreshTimeout, WaitForMessageReturnsNone, set_params

PARAM_FILES_PATH = os.path.join(
    os.path.dirname(__file__),
    "param_test_files",
)


@pytest.fixture(scope="session", autouse=True)
def setup_function():
    """
    Setup parameters before all tests run
    """

    params = [
        ("ACRO_BAL_ROLL", 1, mavlink.MAV_PARAM_TYPE_REAL32),
    ]

    set_params(params)


@pytest.fixture()
def delete_export_files():
    """
    Deletes the exported param files after running a test.
    """
    yield  # this is where the testing happens

    # Teardown
    export_files = [
        "exported_params.parm",
    ]

    for file_name in export_files:
        file_path = os.path.join(PARAM_FILES_PATH, file_name)
        if os.path.exists(file_path):
            os.remove(file_path)


@pytest.fixture()
def inject_params():
    """
    Injects parameters from a file before running a test, reset afterwards.
    """
    import app.droneStatus as droneStatus

    drone = droneStatus.drone

    if not drone:
        yield  # this is where the testing happens
        return

    inject_param_file = os.path.join(PARAM_FILES_PATH, "inject_params.parm")
    inject_params_list = []
    with open(inject_param_file, "r") as f:
        for line in f:
            if line.startswith("#") or line.strip() == "":
                continue
            parts = line.strip().split(",")
            if len(parts) >= 2:
                param_id = parts[0]
                param_value = float(parts[1])
                # We don't care/need param_type for setting params here
                # Plus we can't get it from the .parm file anyways
                inject_params_list.append(
                    {"param_id": param_id, "param_value": param_value}
                )

    old_params = drone.paramsController.params.copy()

    drone.paramsController.params = inject_params_list

    yield  # this is where the testing happens

    # Teardown - reset params
    drone.paramsController.params = old_params


def send_and_receive_params(
    client: SocketIOTestClient,
    endpoint: str,
    args: Optional[Union[List[Any], str]] = None,
) -> dict:
    """
    Sends a request to the socketio test client and awaits a response, returning the entire response (name and args)

    Args:
        client: The socketio test client
        endpoint(str): The endpoint to send the request to
        args(Optional[Union[List[Any], str]]): The arguments to pass to the endpoint

    Returns:
         The data received from the client (name and arguments of the socket.emit)
    """
    client.emit(endpoint, args) if args is not None else client.emit(endpoint)

    timeout = 30  # seconds
    start_time = time.time()
    while True:
        received = client.get_received()
        if (
            received
            and len(received) > 0
            and received[-1]["name"] != "set_multiple_params_progress"
        ):
            return received[-1]
        if time.time() - start_time > timeout:
            raise TimeoutError(
                f"Timeout waiting for response from endpoint '{endpoint}'"
            )
        time.sleep(0.05)  # Sleep briefly to avoid busy waiting


def test_setMultipleParams_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "dashboard"
    socketio_result = send_and_receive_params(
        socketio_client, "set_multiple_params", []
    )

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the params screen to save parameters.",
    }


def test_setMultipleParams_missingData(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    socketio_result = send_and_receive_params(
        socketio_client, "set_multiple_params", []
    )

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "success": False,
        "message": "No parameters to set",
    }


def test_setMultipleParams_invalidData(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    # Invalid Param Type
    droneStatus.state = "params"
    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "RANDOM_ERR_PARAM", "param_value": 1950, "param_type": 11}],
    )

    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "RANDOM_ERR_PARAM", "param_value": 1950, "param_type": 11}
            ],
            "params_set_successfully": [],
        },
    }

    # Param Value too big to fit into param_type data type structure
    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 256, "param_type": 1}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": 256, "param_type": 1}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 128, "param_type": 2}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": 128, "param_type": 2}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 65536, "param_type": 3}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": 65536, "param_type": 3}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 32770, "param_type": 4}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": 32770, "param_type": 4}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 4294967296, "param_type": 5}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {
                    "param_id": "ACRO_BAL_ROLL",
                    "param_value": 4294967296,
                    "param_type": 5,
                }
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 2147483648, "param_type": 6}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {
                    "param_id": "ACRO_BAL_ROLL",
                    "param_value": 2147483648,
                    "param_type": 6,
                }
            ],
            "params_set_successfully": [],
        },
    }

    # Param Value too small to fit into param_type data type structure
    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 1}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 1}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -129, "param_type": 2}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": -129, "param_type": 2}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 3}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 3}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -32770, "param_type": 4}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": -32770, "param_type": 4}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 5}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": -1, "param_type": 5}
            ],
            "params_set_successfully": [],
        },
    }

    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": -2147483686, "param_type": 6}],
    )
    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "Could not set 1 parameters",
        "data": {
            "params_could_not_set": [
                {
                    "param_id": "ACRO_BAL_ROLL",
                    "param_value": -2147483686,
                    "param_type": 6,
                }
            ],
            "params_set_successfully": [],
        },
    }


def test_setMultipleParams_WaitForMessageReturnsNone(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    with WaitForMessageReturnsNone():
        socketio_result = send_and_receive_params(
            socketio_client,
            "set_multiple_params",
            [{"param_id": "ACRO_BAL_ROLL", "param_value": 2, "param_type": 9}],
        )
        assert socketio_result["name"] == "param_set_success"
        assert socketio_result["args"][0] == {
            "success": True,
            "message": "Could not set 1 parameters",
            "data": {
                "params_could_not_set": [
                    {"param_id": "ACRO_BAL_ROLL", "param_value": 2, "param_type": 9}
                ],
                "params_set_successfully": [],
            },
        }


def test_setMultipleParams_successfullySet_paramsState(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    socketio_result = send_and_receive_params(
        socketio_client,
        "set_multiple_params",
        [{"param_id": "ACRO_BAL_ROLL", "param_value": 2, "param_type": 9}],
    )

    assert socketio_result["name"] == "param_set_success"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": "All parameters set successfully",
        "data": {
            "params_could_not_set": [],
            "params_set_successfully": [
                {"param_id": "ACRO_BAL_ROLL", "param_value": 2, "param_type": 9}
            ],
        },
    }


def test_refreshParams_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "dashboard"
    socketio_result = send_and_receive_params(socketio_client, "refresh_params")

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the params screen to refresh the parameters.",
    }


def test_getParams_wrongState(socketio_client: SocketIOTestClient, droneStatus) -> None:
    droneStatus.state = "dashboard"
    socketio_result = send_and_receive_params(socketio_client, "get_params")

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the params screen to get parameters.",
    }


def test_getParams_returnsCachedParams(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    expected_params = [
        {"param_id": "ACRO_BAL_ROLL", "param_value": 2.0, "param_type": 9}
    ]
    droneStatus.drone.paramsController.params = expected_params

    socketio_result = send_and_receive_params(socketio_client, "get_params")

    assert socketio_result["name"] == "get_params_result"
    assert socketio_result["args"][0] == {"success": True, "data": expected_params}


@pytest.mark.skip(reason="Need to find a better way to simulate a timeout")
def test_refreshParams_timeout(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    with ParamRefreshTimeout():
        socketio_result = send_and_receive_params(socketio_client, "refresh_params")
        assert (
            socketio_result["name"] == "params_error"
            or socketio_result["name"] == "get_params_result"
        )
        if socketio_result["name"] == "params_error":
            assert socketio_result["args"][0] == {
                "message": "Parameter request timed out after 3 minutes."
            }

        if socketio_result["name"] == "get_params_result":
            assert socketio_result["args"][0] == {
                "success": True,
                "data": droneStatus.drone.paramsController.params,
            }


def test_refreshParams_alwaysFetchesAndEmitsProgress(
    socketio_client: SocketIOTestClient, droneStatus, monkeypatch
) -> None:
    droneStatus.state = "params"
    droneStatus.drone.paramsController.params = [
        {"param_id": "EXISTING_PARAM", "param_value": 1.0, "param_type": 9}
    ]

    call_count = 0

    def fake_fetch_all_params_blocking(timeout_secs=120, progress_update_callback=None):
        nonlocal call_count
        call_count += 1

        if progress_update_callback:
            progress_update_callback(
                {
                    "current_param_index": 1,
                    "current_param_id": "TEST_PARAM",
                    "total_number_of_params": 2,
                }
            )

        droneStatus.drone.paramsController.params = [
            {"param_id": "TEST_PARAM", "param_value": 2.0, "param_type": 9}
        ]
        return {"success": True, "message": "Got all params"}

    monkeypatch.setattr(
        droneStatus.drone.paramsController,
        "fetchAllParamsBlocking",
        fake_fetch_all_params_blocking,
    )

    socketio_client.emit("refresh_params")
    first_refresh_events = socketio_client.get_received()

    assert any(
        event["name"] == "param_request_update" for event in first_refresh_events
    )
    assert any(event["name"] == "get_params_result" for event in first_refresh_events)
    assert any(
        event["name"] == "get_params_result"
        and event["args"][0]
        == {
            "success": True,
            "data": [{"param_id": "TEST_PARAM", "param_value": 2.0, "param_type": 9}],
        }
        for event in first_refresh_events
    )

    socketio_client.emit("refresh_params")
    second_refresh_events = socketio_client.get_received()

    assert any(
        event["name"] == "param_request_update" for event in second_refresh_events
    )
    assert any(event["name"] == "get_params_result" for event in second_refresh_events)
    assert any(
        event["name"] == "get_params_result"
        and event["args"][0]
        == {
            "success": True,
            "data": [{"param_id": "TEST_PARAM", "param_value": 2.0, "param_type": 9}],
        }
        for event in second_refresh_events
    )
    assert call_count == 2


def test_exportParamsToFile_wrongState(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "dashboard"

    socketio_client.emit(
        "export_params_to_file", {"file_path": "test_params_output.txt"}
    )
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "params_error"
    assert socketio_result["args"][0] == {
        "message": "You must be on the params screen to export parameters.",
    }


def test_exportParamsToFile_noFilePath(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    droneStatus.state = "params"
    socketio_client.emit("export_params_to_file", {})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "export_params_result"
    assert socketio_result["args"][0] == {
        "success": False,
        "message": "No file path provided.",
    }


def test_exportParamsToFile_incorrectFilePath(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    export_file_path = os.path.join(
        PARAM_FILES_PATH, "random_folder_that_should_not_exist", "exported_params.parm"
    )

    droneStatus.state = "params"
    socketio_client.emit("export_params_to_file", {"file_path": export_file_path})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "export_params_result"
    assert socketio_result["args"][0]["success"] is False

    # Check that the message contains the expected error indicators
    message = socketio_result["args"][0]["message"]
    assert "Failed to export params to file:" in message
    assert "No such file or directory:" in message
    assert "random_folder_that_should_not_exist" in message
    assert "exported_params.parm" in message


@pytest.mark.usefixtures("delete_export_files")
@pytest.mark.usefixtures("inject_params")
def test_exportParamsToFile_success(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    export_file_path = os.path.join(PARAM_FILES_PATH, "exported_params.parm")

    droneStatus.state = "params"
    socketio_client.emit("export_params_to_file", {"file_path": export_file_path})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "export_params_result"
    assert socketio_result["args"][0] == {
        "success": True,
        "message": f"Parameters exported successfully to {export_file_path}",
    }

    # Verify file contents
    with open(export_file_path, "r") as f:
        lines = [
            line
            for line in f.readlines()
            if line.strip() != "" and not line.startswith("#")
        ]
    with open(os.path.join(PARAM_FILES_PATH, "inject_params.parm"), "r") as f:
        expected_lines = [
            line
            for line in f.readlines()
            if line.strip() != "" and not line.startswith("#")
        ]
    assert lines == expected_lines


@pytest.mark.usefixtures("delete_export_files")
def test_exportParamsToFile_formats_numeric_values(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    export_file_path = os.path.join(PARAM_FILES_PATH, "exported_params.parm")
    droneStatus.state = "params"

    # Inject controlled values that previously exhibited formatting issues.
    droneStatus.drone.paramsController.params = [
        {
            "param_id": "TEST_ONE",
            "param_value": 1.0,
            "param_type": mavlink.MAV_PARAM_TYPE_REAL32,
        },
        {
            "param_id": "TEST_TWO",
            "param_value": 0.100000000134412,
            "param_type": mavlink.MAV_PARAM_TYPE_REAL32,
        },
    ]

    socketio_client.emit("export_params_to_file", {"file_path": export_file_path})
    socketio_result = socketio_client.get_received()[0]

    assert socketio_result["name"] == "export_params_result"
    assert socketio_result["args"][0]["success"] is True

    with open(export_file_path, "r") as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]

    assert "TEST_ONE,1" in lines
    assert "TEST_TWO,0.1" in lines
