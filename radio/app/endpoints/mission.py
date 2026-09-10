from typing import Any

from typing_extensions import NotRequired, TypedDict

import app.droneStatus as droneStatus
from app import logger, socketio
from app.controllers.missionController import (
    exportMissionToFile as exportMissionToFileNotConnected,
)
from app.controllers.missionController import (
    importMissionFromFile as importMissionFromFileNotConnected,
)
from app.utils import notConnectedError


class CurrentMissionType(TypedDict):
    type: str


class WriteCurrentMissionType(TypedDict):
    type: str
    items: list[dict]


class ImportMissionFileType(TypedDict):
    type: str
    file_path: str


class ExportMissionFileType(TypedDict):
    type: str
    file_path: str
    items: list[dict]


class ControlMissionType(TypedDict):
    action: str
    seq: NotRequired[int]


class WaypointRadiusDataType(TypedDict):
    radius: float


def progressUpdateCallback(message: str, progress: float) -> None:
    """
    Callback that is used to update the frontend with the current mission function progress.
    """
    socketio.emit(
        "current_mission_progress", {"message": message, "progress": progress}
    )


@socketio.on("get_current_mission")
def getCurrentMission(data: CurrentMissionType) -> None:
    """
    Sends the current mission to the frontend, only works if dashboard or missions screen is loaded.
    """
    if droneStatus.state not in ["dashboard", "missions"]:
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the dashboard or missions screen to get the current mission."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="get current mission")

    mission_type = data.get("type")
    mission_type_array = ["mission", "fence", "rally"]

    if mission_type not in mission_type_array:
        socketio.emit(
            "current_mission",
            {
                "success": False,
                "message": f"Invalid mission type. Must be 'mission', 'fence', or 'rally', got {mission_type}.",
            },
        )
        logger.error(f"Could not get mission items for {mission_type} type.")
        return

    result = droneStatus.drone.missionController.getCurrentMission(
        mission_type_array.index(mission_type), progressUpdateCallback
    )

    if not result.get("success"):
        logger.error(result.get("message"))
        socketio.emit("current_mission", result)
        return

    socketio.emit(
        "current_mission",
        {"success": True, "mission_type": mission_type, "items": result.get("data")},
    )


@socketio.on("get_current_mission_all")
def getCurrentMissionAll() -> None:
    """
    Sends the current mission to the frontend, only works if dashboard or missions screen is loaded.
    """
    if droneStatus.state not in ["dashboard", "missions"]:
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the dashboard or missions screen to get the current mission."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="get current mission")

    result = droneStatus.drone.missionController.getCurrentMissionAll()

    if not result.get("success"):
        socketio.emit("current_mission_all", result)
        return

    data: dict[str, Any] = result.get("data", {})
    if not isinstance(data, dict):
        data = {}

    socketio.emit(
        "current_mission_all",
        {
            "success": True,
            "mission_items": data.get("mission_items", []),
            "fence_items": data.get("fence_items", []),
            "rally_items": data.get("rally_items", []),
        },
    )


@socketio.on("write_current_mission")
def writeCurrentMission(data: WriteCurrentMissionType) -> None:
    """
    Writes the current mission to the drone, only works if missions screen is loaded.
    """
    if droneStatus.state != "missions":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the missions screen to write the current mission."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="write current mission")

    mission_type = data.get("type")
    mission_type_array = ["mission", "fence", "rally"]

    if mission_type not in mission_type_array:
        socketio.emit(
            "write_mission_result",
            {
                "success": False,
                "message": f"Invalid mission type. Must be 'mission', 'fence', or 'rally', got {mission_type}.",
            },
        )
        logger.error(
            f"Invalid mission type: {mission_type}. Must be 'mission', 'fence', or 'rally'."
        )
        return

    items = data.get("items", [])

    result = droneStatus.drone.missionController.uploadMission(
        mission_type_array.index(mission_type), items, progressUpdateCallback
    )
    if not result.get("success"):
        logger.error(result.get("message"))

    socketio.emit("write_mission_result", result)


@socketio.on("import_mission_from_file")
def importMissionFromFile(data: ImportMissionFileType) -> None:
    if droneStatus.state != "missions":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the missions screen to import a mission from a file."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    mission_type = data.get("type")
    mission_type_array = ["mission", "fence", "rally"]

    if mission_type not in mission_type_array:
        socketio.emit(
            "import_mission_result",
            {
                "success": False,
                "message": f"Invalid mission type. Must be 'mission', 'fence', or 'rally', got {mission_type}.",
            },
        )
        logger.error(
            f"Invalid mission type: {mission_type}. Must be 'mission', 'fence', or 'rally'."
        )
        return

    file_path = data.get("file_path", "")

    if droneStatus.drone is not None:
        result = droneStatus.drone.missionController.importMissionFromFile(
            mission_type_array.index(mission_type), file_path
        )
    else:
        result = importMissionFromFileNotConnected(
            mission_type_array.index(mission_type), file_path
        )

    if not result.get("success"):
        logger.error(result.get("message"))
        socketio.emit("import_mission_result", result)
    else:
        socketio.emit(
            "import_mission_result",
            {
                "success": True,
                "message": result.get("message", ""),
                "items": result.get("data", []),
                "mission_type": mission_type,
            },
        )


@socketio.on("export_mission_to_file")
def exportMissionToFile(data: ExportMissionFileType) -> None:
    if droneStatus.state != "missions":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the missions screen to export a mission to a file."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    mission_type = data.get("type")
    mission_type_array = ["mission", "fence", "rally"]

    if mission_type not in mission_type_array:
        socketio.emit(
            "export_mission_result",
            {
                "success": False,
                "message": f"Invalid mission type. Must be 'mission', 'fence', or 'rally', got {mission_type}.",
            },
        )
        logger.error(
            f"Invalid mission type: {mission_type}. Must be 'mission', 'fence', or 'rally'."
        )
        return

    file_path = data.get("file_path", "")
    items = data.get("items", [])

    if droneStatus.drone is not None:
        result = droneStatus.drone.missionController.exportMissionToFile(
            mission_type_array.index(mission_type), file_path, items
        )
    else:
        result = exportMissionToFileNotConnected(
            mission_type_array.index(mission_type), file_path, items
        )

    if not result.get("success"):
        logger.error(result.get("message"))

    socketio.emit("export_mission_result", result)


@socketio.on("control_mission")
def controlMission(data: ControlMissionType) -> None:
    """
    Controls the current mission based on the action, only works if dashboard screen is loaded.
    """
    if droneStatus.state != "dashboard":
        socketio.emit(
            "params_error",
            {"message": "You must be on the dashboard screen to control a mission."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="control mission")

    action = data.get("action", None)

    if action not in ["start", "restart", "set_current"]:
        socketio.emit(
            "params_error",
            {"message": f"Invalid action for controlling the mission, got {action}."},
        )
        logger.debug(f"Invalid action for controlling the mission: {action}")
        return

    if action == "start":
        result = droneStatus.drone.missionController.startMission()
    elif action == "restart":
        result = droneStatus.drone.missionController.restartMission()
    elif action == "set_current":
        seq = data.get("seq", None)

        if seq is None:
            socketio.emit(
                "params_error",
                {"message": "No mission item number specified to set as current."},
            )
            logger.debug("No seq specified for set_current mission action")
            return

        result = droneStatus.drone.missionController.setCurrentMissionItem(seq)

    socketio.emit("mission_control_result", result)


@socketio.on("get_waypoint_radius")
def getWaypointRadius() -> None:
    """
    Gets the waypoint acceptance radius in metres, only works if the missions screen
    is loaded.
    """
    if droneStatus.state != "missions":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the missions screen to get the waypoint radius."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="get waypoint radius")

    result = droneStatus.drone.missionController.getWaypointRadius()

    socketio.emit("waypoint_radius_result", result)


@socketio.on("set_waypoint_radius")
def setWaypointRadius(data: WaypointRadiusDataType) -> None:
    """
    Sets the waypoint acceptance radius, only works if the missions screen is loaded.
    """
    if droneStatus.state != "missions":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the missions screen to set the waypoint radius."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        return notConnectedError(action="set waypoint radius")

    radius = data.get("radius", None)
    if radius is None or radius <= 0:
        socketio.emit(
            "params_error",
            {"message": f"Waypoint radius must be a positive number, got {radius}."},
        )
        return

    result = droneStatus.drone.missionController.setWaypointRadius(radius)

    socketio.emit("set_waypoint_radius_result", result)
