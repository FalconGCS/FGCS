from __future__ import annotations

import os
from logging import getLogger
from threading import current_thread
from typing import TYPE_CHECKING, Any, Callable, List, Optional

import serial
from app.customTypes import Number, Response
from app.utils import commandAccepted, sendingCommandLock
from pymavlink import mavutil, mavwp

if TYPE_CHECKING:
    from app.drone import Drone

TYPE_MISSION = mavutil.mavlink.MAV_MISSION_TYPE_MISSION
TYPE_FENCE = mavutil.mavlink.MAV_MISSION_TYPE_FENCE
TYPE_RALLY = mavutil.mavlink.MAV_MISSION_TYPE_RALLY
MISSION_TYPES = [TYPE_MISSION, TYPE_FENCE, TYPE_RALLY]

logger = getLogger("fgcs")


def _checkMissionType(mission_type: int) -> Response:
    """
    Check if the mission type is valid.

    Args:
        mission_type (int): The type of mission to check.

    Returns:
        Response: A response dict with success status.
    """
    if mission_type not in MISSION_TYPES:
        return {
            "success": False,
            "message": f"Invalid mission type {mission_type}. Must be one of {MISSION_TYPES}",
        }
    return {"success": True}


def _convertCoordinate(coordinate) -> Number:
    """
    Convert a coordinate between int and float formats.

    Args:
        coordinate: The coordinate to convert (int or float).

    Returns:
        Number: The converted coordinate.
    """
    gps_coordinate_scale = 1e7

    if isinstance(coordinate, float):
        return int(coordinate * gps_coordinate_scale)
    elif isinstance(coordinate, int):
        return coordinate / gps_coordinate_scale

    raise ValueError(
        f"Invalid coordinate type {type(coordinate)}. Must be int or float."
    )


def _wp_to_dict(
    wp: mavutil.mavlink.MAVLink_mission_item_int_message,
    altitude_decimal_places: int = 4,
) -> dict:
    """
    Convert a MAVLink mission item to a dict, rounding the altitude (z) field
    to a fixed number of decimal places to avoid floating-point noise.

    Args:
        wp: A MAVLink mission item object with a to_dict() method.
        altitude_decimal_places (int): Number of decimal places to round z to.

    Returns:
        dict: The waypoint as a dictionary with z rounded.
    """
    d = wp.to_dict()
    if "z" in d and isinstance(d["z"], float):
        d["z"] = round(d["z"], altitude_decimal_places)
    return d


def _getMissionName(mission_type: int) -> str:
    """
    Get the name of the mission type.

    Args:
        mission_type (int): The type of mission to get the name for.

    Returns:
        str: The name of the mission type.
    """
    if mission_type == TYPE_MISSION:
        return "mission"
    elif mission_type == TYPE_FENCE:
        return "fence"
    elif mission_type == TYPE_RALLY:
        return "rally"
    else:
        logger.error(f"Invalid mission type {mission_type}")
        return "unknown"


def _getCommandName(command: int) -> str:
    """
    Get the name of the command type.

    Args:
        command (int): The command to get the name for.

    Returns:
        str: The name of the command.
    """
    try:
        return mavutil.mavlink.enums["MAV_CMD"][command].name
    except KeyError:
        return f"Unknown command {command}"


def _parseWaypointsListIntoLoader(
    waypoints: List[dict],
    mission_type: int,
    target_system: int = 1,
    target_component: int = 1,
) -> mavwp.MAVWPLoader:
    """
    Parses a list of waypoints into a MAVWPLoader object.

    Args:
        waypoints (List[dict]): The list of waypoints to parse.
        mission_type (int): The type of mission. 0=Mission,1=Fence,2=Rally.
        target_system (int): The target system ID (default: 1).
        target_component (int): The target component ID (default: 1).

    Returns:
        mavwp.MAVWPLoader: The loader object with parsed waypoints.
    """
    if mission_type == TYPE_MISSION:
        loader = mavwp.MAVWPLoader(
            target_system=target_system, target_component=target_component
        )
    elif mission_type == TYPE_FENCE:
        loader = mavwp.MissionItemProtocol_Fence(
            target_system=target_system, target_component=target_component
        )
    elif mission_type == TYPE_RALLY:
        loader = mavwp.MissionItemProtocol_Rally(
            target_system=target_system, target_component=target_component
        )
    else:
        logger.error(f"Invalid mission type {mission_type}")
        raise ValueError(f"Invalid mission type {mission_type}")

    for wp in waypoints:
        if isinstance(wp, mavutil.mavlink.MAVLink_mission_item_int_message):
            loader.add(wp)
        elif isinstance(wp, dict):
            # Convert dict to MAVLink mission item int message
            p = mavutil.mavlink.MAVLink_mission_item_int_message(
                target_system,
                target_component,
                wp["seq"],
                wp["frame"],
                wp["command"],
                wp["current"],
                wp["autocontinue"],
                wp["param1"],
                wp["param2"],
                wp["param3"],
                wp["param4"],
                int(wp["x"]),
                int(wp["y"]),
                wp["z"],
                wp["mission_type"],
            )
            loader.add(p)
        else:
            logger.error(f"Invalid waypoint type {type(wp)} in waypoints list")
            raise ValueError(f"Invalid waypoint type {type(wp)} in waypoints list")

    logger.debug(
        f"Parsed {loader.count()} waypoints into loader for mission type {mission_type}"
    )
    return loader


def importMissionFromFile(
    mission_type: int, file_path: str, target_system: int = 1, target_component: int = 1
) -> Response:
    """
    Imports a mission from a file, return the waypoints loaded.

    Args:
        mission_type (int): The type of mission to import. 0=Mission,1=Fence,2=Rally.
        file_path (str): The path to the waypoint file to import.
        target_system (int): The target system ID (default: 1).
        target_component (int): The target component ID (default: 1).

    Returns:
        Response: A response dict with success status and waypoint data.
    """
    mission_type_check = _checkMissionType(mission_type)
    if not mission_type_check.get("success"):
        return mission_type_check

    if not file_path or not os.path.exists(file_path):
        logger.error(f"Waypoint file not found at {file_path}")
        return {
            "success": False,
            "message": f"Waypoint file not found at {file_path}",
        }

    logger.debug(
        f"Importing waypoint file from {file_path} for mission type {mission_type}"
    )

    if mission_type == TYPE_MISSION:
        loader = mavwp.MAVWPLoader(
            target_system=target_system, target_component=target_component
        )
    elif mission_type == TYPE_FENCE:
        loader = mavwp.MissionItemProtocol_Fence(
            target_system=target_system, target_component=target_component
        )
    else:
        loader = mavwp.MissionItemProtocol_Rally(
            target_system=target_system, target_component=target_component
        )

    try:
        loader.load(file_path)
    except Exception as e:
        logger.error(f"Failed to load waypoint file: {e}")
        return {
            "success": False,
            "message": f"Failed to load waypoint file: {e}",
        }

    # Remove the first point if it's a command 16 as this is usually a home point or placeholder.
    if mission_type in [TYPE_FENCE, TYPE_RALLY]:
        if loader.count() > 0:
            first_wp = loader.item(0)
            if first_wp.command == 16:
                loader.remove(first_wp)
        else:
            logger.error("Loader is empty; no waypoints to process.")
            return {
                "success": False,
                "message": "Loader is empty; no waypoints to process.",
            }

    for wp in loader.wpoints:
        # Check if mission type correlates to correct command
        if (
            (
                mission_type == TYPE_RALLY
                and wp.command != mavutil.mavlink.MAV_CMD_NAV_RALLY_POINT
            )
            or (
                mission_type == TYPE_FENCE
                and wp.command
                not in [
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_RETURN_POINT,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION,
                ]
            )
            or (
                mission_type == TYPE_MISSION
                and wp.command
                in [
                    mavutil.mavlink.MAV_CMD_NAV_RALLY_POINT,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_RETURN_POINT,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION,
                    mavutil.mavlink.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION,
                ]
            )
        ):
            logger.error(
                f"Waypoint command {_getCommandName(wp.command)} does not match mission type {_getMissionName(mission_type)}"
            )
            return {
                "success": False,
                "message": f"Could not load the waypoint file. Waypoint command {_getCommandName(wp.command)} does not match mission type {_getMissionName(mission_type)}",
            }

        # Convert coordinates to the correct format
        if hasattr(wp, "x") and hasattr(wp, "y"):
            try:
                wp.x = _convertCoordinate(wp.x)
                wp.y = _convertCoordinate(wp.y)
            except ValueError as e:
                logger.error(f"Error converting coordinates for waypoint {wp}: {e}")
                return {
                    "success": False,
                    "message": f"Error converting coordinates for waypoint {wp}: {e}",
                }

    logger.info(f"Loaded waypoint file with {loader.count()} points successfully")
    return {
        "success": True,
        "message": f"Waypoint file loaded {loader.count()} points successfully",
        "data": [_wp_to_dict(wp) for wp in loader.wpoints],
    }


def exportMissionToFile(
    mission_type: int,
    file_path: str,
    waypoints: List[dict],
    target_system: int = 1,
    target_component: int = 1,
) -> Response:
    """
    Exports a mission to a file from a given list of waypoints.

    Args:
        mission_type (int): The type of mission to export. 0=Mission,1=Fence,2=Rally.
        file_path (str): The path to the waypoint file to export.
        waypoints (List[dict]): The list of waypoints to upload. Each waypoint should be a dict with the required fields.
        target_system (int): The target system ID (default: 1).
        target_component (int): The target component ID (default: 1).

    Returns:
        Response: A response dict with success status.
    """
    mission_type_check = _checkMissionType(mission_type)
    if not mission_type_check.get("success"):
        return mission_type_check

    try:
        loader = _parseWaypointsListIntoLoader(
            waypoints, mission_type, target_system, target_component
        )
    except ValueError as e:
        logger.error(f"Error parsing waypoints: {e}")
        return {
            "success": False,
            "message": f"Error parsing waypoints: {e}",
        }

    # Convert coordinates to the correct format for saving
    for wp in loader.wpoints:
        if hasattr(wp, "x") and hasattr(wp, "y"):
            try:
                wp.x = _convertCoordinate(wp.x)
                wp.y = _convertCoordinate(wp.y)
            except ValueError as e:
                logger.error(f"Error converting coordinates for waypoint {wp}: {e}")
                return {
                    "success": False,
                    "message": f"Error converting coordinates for waypoint {wp}: {e}",
                }

    if loader.count() == 0:
        return {
            "success": False,
            "message": f"No waypoints loaded for the mission type of {_getMissionName(mission_type)}",
        }

    logger.debug(
        f"Exporting waypoint file to {file_path} for mission type {_getMissionName(mission_type)}"
    )

    try:
        loader.save(file_path)
    except Exception as e:
        logger.error(f"Failed to save waypoint file: {e}")
        return {
            "success": False,
            "message": f"Failed to save waypoint file: {e}",
        }

    logger.info(
        f"Saved waypoint file with {loader.count()} points successfully to {file_path}"
    )
    return {
        "success": True,
        "message": f"Waypoint file saved {loader.count()} points successfully to {file_path}",
    }


class MissionController:
    def __init__(self, drone: Drone) -> None:
        """
        The mission class controls all mission-related actions.

        Args:
            drone (Drone): The main drone object
        """

        self.drone = drone
        self.controller_id = f"MissionController_{current_thread().ident}"

        # Loaders are only used to manage the mission items that are currently loaded in the drone.
        # Importing and exporting mission items to/from files do not use loaders as these waypoints
        # are not then loaded into the drone's mission items.
        self.missionLoader = mavwp.MAVWPLoader(
            target_system=drone.target_system, target_component=drone.target_component
        )
        self.fenceLoader = mavwp.MissionItemProtocol_Fence(
            target_system=drone.target_system, target_component=drone.target_component
        )
        self.rallyLoader = mavwp.MissionItemProtocol_Rally(
            target_system=drone.target_system, target_component=drone.target_component
        )

    def getCurrentMission(
        self,
        mission_type: int,
        progressUpdateCallback: Optional[Callable[[str, float], None]] = None,
    ) -> Response:
        """
        Get the current mission of a specific type from the drone.

        Args:
            mission_type (int): The type of mission to get. 0=Mission,1=Fence,2=Rally.
            progressUpdateCallback (Optional[Callable]): A callback function to update the progress of the mission fetch.
                The callback should accept a string message and a float progress value.
        """
        mission_type_check = _checkMissionType(mission_type)
        if not mission_type_check.get("success"):
            return mission_type_check

        failure_message = "Could not get current mission"

        try:
            mission_items = self.getMissionItems(mission_type, progressUpdateCallback)
            if not mission_items.get("success"):
                return {
                    "success": False,
                    "message": mission_items.get("message", failure_message),
                }

            return {
                "success": True,
                "data": [_wp_to_dict(item) for item in mission_items.get("data", [])],
            }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": f"{failure_message}, serial exception",
            }

    def getCurrentMissionAll(self) -> Response:
        """
        Get the current mission, fence and rally from the drone.
        """
        mission_items: List[Any] = []
        fence_items: List[Any] = []
        rally_items: List[Any] = []

        _mission_items = self.getMissionItems(mission_type=TYPE_MISSION)
        if _mission_items.get("success"):
            mission_items = _mission_items.get("data", [])
        else:
            return _mission_items

        _fence_items = self.getMissionItems(mission_type=TYPE_FENCE)
        if _fence_items.get("success"):
            fence_items = _fence_items.get("data", [])
        else:
            return _fence_items

        _rally_items = self.getMissionItems(mission_type=TYPE_RALLY)
        if _rally_items.get("success"):
            rally_items = _rally_items.get("data", [])
        else:
            return _rally_items

        return {
            "success": True,
            "data": {
                "mission_items": [_wp_to_dict(item) for item in mission_items],
                "fence_items": [_wp_to_dict(item) for item in fence_items],
                "rally_items": [_wp_to_dict(item) for item in rally_items],
            },
        }

    @sendingCommandLock
    def getMissionItems(
        self,
        mission_type: int,
        progressUpdateCallback: Optional[Callable[[str, float], None]] = None,
    ) -> Response:
        """
        Get all mission items of a specific type from the drone.

        Args:
            mission_type (int): The type of mission to get. 0=Mission,1=Fence,2=Rally.
            progressUpdateCallback (Optional[Callable]): A callback function to update the progress of the mission fetch.
                The callback should accept a string message and a float progress value.
        """
        mission_type_check = _checkMissionType(mission_type)
        if not mission_type_check.get("success"):
            return mission_type_check

        failure_message = "Could not get current mission items"

        if mission_type == TYPE_MISSION:
            loader = self.missionLoader
        elif mission_type == TYPE_FENCE:
            loader = self.fenceLoader
        else:
            loader = self.rallyLoader

        if not self.drone.reserve_message_type("MISSION_COUNT", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve MISSION_COUNT messages",
            }

        try:
            try:
                self.drone.master.mav.mission_request_list_send(
                    self.drone.target_system,
                    mavutil.mavlink.MAV_COMP_ID_AUTOPILOT1,
                    mission_type=mission_type,
                )
            except TypeError:
                # TypeError is raised if mavlink V1 is used where the mission_request_list_send
                # function does not have a mission_type parameter
                self.drone.logger.error(
                    "Failed to request mission list from autopilot, got type error. Trying again without mission type."
                )
                return {
                    "success": False,
                    "message": "Failed to request mission list from autopilot, got type error. Try reconnecting to the drone.",
                }

            response = self.drone.wait_for_message(
                "MISSION_COUNT",
                self.controller_id,
                timeout=2,
                condition_func=lambda msg: msg.mission_type == mission_type,
            )

            if response:
                if response.mission_type != mission_type:
                    self.drone.logger.error(
                        f"Received response with wrong mission type {response.mission_type}, expected {mission_type}"
                    )
                    return {
                        "success": False,
                        "message": f"Received response with wrong mission type {response.mission_type}, expected {mission_type}",
                    }
                self.drone.logger.debug(
                    f"Got response for mission count of {response.count} for mission type {response.mission_type}"
                )
                loader.clear()

                if progressUpdateCallback:
                    progressUpdateCallback(
                        f"Received count of {response.count} waypoints", 0.0
                    )

                for i in range(0, response.count):
                    retry_count = 0
                    while retry_count < 3:
                        item_response = self.getItemDetails(
                            i, mission_type, response.count
                        )
                        if not item_response.get("success"):
                            retry_count += 1
                            self.drone.logger.warning(
                                f"Failed to get item details for mission item {i} for mission type {mission_type}, retry count {retry_count}/3"
                            )
                            continue

                        item_response_data = item_response.get("data", None)

                        if item_response_data:
                            loader.add(item_response_data)

                            if progressUpdateCallback and response.count != 0:
                                progressUpdateCallback(
                                    f"Received waypoint {i + 1}",
                                    (i + 1) / response.count,
                                )

                            break
                        else:
                            self.drone.logger.warning(
                                f"Failed to get item details for mission item {i} for mission type {mission_type}"
                            )
                            continue
                    else:
                        return {
                            "success": False,
                            "message": item_response.get("message", failure_message),
                        }
                return {
                    "success": True,
                    "data": loader.wpoints,
                }
            else:
                self.drone.logger.error(
                    f"No response received for mission count for mission type {mission_type}."
                )
                return {
                    "success": False,
                    "message": failure_message,
                }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": f"{failure_message}, serial exception",
            }
        finally:
            self.drone.release_message_type("MISSION_COUNT", self.controller_id)

    def getItemDetails(
        self, item_number: int, mission_type: int, mission_count: int
    ) -> Response:
        """
        Get the details of a specific mission item.

        Args:
            item_number (int): The number of the mission item to get
            mission_type (int): The type of mission to get. 0=Mission,1=Fence,2=Rally
            mission_count (int): The total count of mission items for the mission type, used just for logging

        Returns:
            Dict: The details of the mission item
        """
        mission_type_check = _checkMissionType(mission_type)
        if not mission_type_check.get("success"):
            return mission_type_check

        failure_message = f"Failed to get mission item {item_number + 1}/{mission_count} for mission type {mission_type}"

        if not self.drone.reserve_message_type("MISSION_ITEM_INT", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve MISSION_ITEM_INT messages",
            }

        try:
            # The sending_command_lock is held by the caller function getMissionItems
            self.drone.master.mav.mission_request_int_send(
                self.drone.target_system,
                mavutil.mavlink.MAV_COMP_ID_AUTOPILOT1,
                item_number,
                mission_type=mission_type,
            )

            response = self.drone.wait_for_message(
                "MISSION_ITEM_INT",
                self.controller_id,
                timeout=1.5,
                condition_func=lambda msg: (
                    msg.mission_type == mission_type and msg.seq == item_number
                ),
            )

            if response:
                self.drone.logger.debug(
                    f"Got response for mission item {item_number + 1}/{mission_count} for mission type {mission_type}"
                )
                return {
                    "success": True,
                    "data": response,
                }

            else:
                self.drone.logger.error(
                    f"Got no response for mission item {item_number + 1}/{mission_count} for mission type {mission_type}"
                )
                return {
                    "success": False,
                    "message": failure_message,
                }

        except serial.serialutil.SerialException:
            self.drone.logger.error(
                f"Got no response for mission item {item_number + 1}/{mission_count}, serial exception"
            )
            return {
                "success": False,
                "message": f"{failure_message}, serial exception",
            }
        finally:
            self.drone.release_message_type("MISSION_ITEM_INT", self.controller_id)

    @sendingCommandLock
    def startMission(self) -> Response:
        """
        Start the mission on the drone.

        Returns:
            Dict: The response of the mission start request
        """
        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        try:
            self.drone.sendCommand(
                mavutil.mavlink.MAV_CMD_MISSION_START,
            )

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: (
                    msg.command == mavutil.mavlink.MAV_CMD_MISSION_START
                ),
            )

            if commandAccepted(response, mavutil.mavlink.MAV_CMD_MISSION_START):
                return {
                    "success": True,
                    "message": "Starting mission",
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to start mission",
                }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Failed to start mission, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    @sendingCommandLock
    def restartMission(self) -> Response:
        """
        Restarts the mission on the drone.

        Returns:
            Dict: The response of the mission restart request
        """
        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        try:
            self.drone.sendCommand(
                mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT, param2=1
            )

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: (
                    msg.command == mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT
                ),
            )

            if commandAccepted(
                response, mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT
            ):
                return {
                    "success": True,
                    "message": "Restarting mission",
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to restart mission",
                }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Failed to restart mission, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    @sendingCommandLock
    def setCurrentMissionItem(self, item_number: int) -> Response:
        """
        Sets the current mission item on the drone, directing the aircraft to it.
        """
        if not isinstance(item_number, int) or isinstance(item_number, bool):
            return {
                "success": False,
                "message": f"Mission item number must be an integer, got {item_number}",
            }

        if item_number < 0:
            return {
                "success": False,
                "message": f"Mission item number must not be negative, got {item_number}",
            }

        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        try:
            self.drone.sendCommand(
                mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT, param1=item_number
            )

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: (
                    msg.command == mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT
                ),
            )

            if commandAccepted(
                response, mavutil.mavlink.MAV_CMD_DO_SET_MISSION_CURRENT
            ):
                return {
                    "success": True,
                    "message": f"Set current mission item to {item_number}",
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to set current mission item to {item_number}",
                }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Failed to set current mission item, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    @sendingCommandLock
    def clearMission(self, mission_type: int) -> Response:
        """
        Clears the specified mission type from the drone.

        Args:
            mission_type (int): The type of mission to clear. 0=Mission,1=Fence,2=Rally.
        """
        mission_type_check = _checkMissionType(mission_type)
        if not mission_type_check.get("success"):
            return mission_type_check

        if not self.drone.reserve_message_type("MISSION_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve MISSION_ACK messages",
            }

        try:
            self.drone.master.mav.mission_clear_all_send(
                self.drone.target_system,
                self.drone.target_component,
                mission_type=mission_type,
            )

            while True:
                response = self.drone.wait_for_message(
                    "MISSION_ACK",
                    self.controller_id,
                    timeout=2,
                    condition_func=lambda msg: msg.mission_type == mission_type,
                )

                if not response:
                    return {
                        "success": False,
                        "message": "Could not clear mission",
                    }
                elif response.type == 0:
                    return {
                        "success": True,
                        "message": "Mission cleared successfully",
                    }
                else:
                    self.drone.logger.error(
                        f"Error clearing mission, mission ack response: {response.type}"
                    )
                    return {
                        "success": False,
                        "message": "Could not clear mission",
                    }

        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Could not clear mission, serial exception",
            }
        finally:
            self.drone.release_message_type("MISSION_ACK", self.controller_id)

    def _parseWaypointsListIntoLoader(
        self, waypoints: List[dict], mission_type: int
    ) -> mavwp.MAVWPLoader:
        """
        Parses a list of waypoints into a MAVWPLoader object.

        This is a wrapper method that calls the standalone _parseWaypointsListIntoLoader function
        with the drone's target_system and target_component.
        """
        return _parseWaypointsListIntoLoader(
            waypoints,
            mission_type,
            target_system=self.drone.target_system,
            target_component=self.drone.target_component,
        )

    def uploadMission(
        self,
        mission_type: int,
        waypoints: List[dict],
        progressUpdateCallback: Optional[Callable[[str, float], None]] = None,
    ) -> Response:
        """
        Uploads the current mission to the drone. This method overwrites the current loader if the upload is successful.

        Args:
            mission_type (int): The type of mission to upload. 0=Mission,1=Fence,2=Rally.
            waypoints (List[dict]): The list of waypoints to upload. Each waypoint should be a dict with the required fields.
            progressUpdateCallback (Optional[Callable]): A callback function to update the progress of the mission writing.
                The callback should accept a string message and a float progress value.
        """
        mission_type_check = _checkMissionType(mission_type)
        if not mission_type_check.get("success"):
            return mission_type_check

        try:
            new_loader = self._parseWaypointsListIntoLoader(waypoints, mission_type)
        except ValueError as e:
            self.drone.logger.error(f"Error parsing waypoints: {e}")
            return {
                "success": False,
                "message": f"Error parsing waypoints: {e}",
            }

        clear_mission_response = self.clearMission(mission_type)
        if not clear_mission_response.get("success"):
            return clear_mission_response

        # If the loader is empty, we don't need to upload anything.
        if new_loader.count() == 0:
            self.drone.logger.info(
                f"Cleared mission type {mission_type}, no waypoints to upload"
            )
            return {
                "success": True,
                "message": f"Cleared mission type {mission_type}, no waypoints to upload",
            }

        if not self.drone.reserve_message_type("MISSION_REQUEST", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve MISSION_REQUEST messages",
            }

        if not self.drone.reserve_message_type("MISSION_ACK", self.controller_id):
            self.drone.release_message_type("MISSION_REQUEST", self.controller_id)
            return {
                "success": False,
                "message": "Could not reserve MISSION_ACK messages",
            }

        try:
            self.drone.sending_command_lock.acquire()

            self.drone.master.mav.mission_count_send(
                self.drone.target_system,
                self.drone.target_component,
                new_loader.count(),
                mission_type=mission_type,
            )

            while True:
                # Wait for either MISSION_REQUEST or MISSION_ACK
                response = None
                mission_request = self.drone.wait_for_message(
                    "MISSION_REQUEST",
                    self.controller_id,
                    timeout=2,
                    condition_func=lambda msg: msg.mission_type == mission_type,
                )
                if not mission_request:
                    mission_ack = self.drone.wait_for_message(
                        "MISSION_ACK",
                        self.controller_id,
                        timeout=2,
                        condition_func=lambda msg: msg.mission_type == mission_type,
                    )
                    if mission_ack:
                        if mission_ack.type != 0:
                            self.drone.logger.error(
                                f"Error uploading mission, mission ack response: {mission_ack.type}"
                            )
                            return {
                                "success": False,
                                "message": "Could not upload mission, received mission acknowledgement error",
                            }
                        else:
                            continue  # Continue if we received a successful MISSION_ACK
                    else:
                        return {
                            "success": False,
                            "message": "Could not upload mission, mission request not received",
                        }
                else:
                    response = mission_request

                if response:
                    self.drone.logger.debug(
                        f"Sending mission item {response.seq + 1} out of {new_loader.count()}"
                    )
                    self.drone.master.mav.send(new_loader.item(response.seq))

                    if progressUpdateCallback and new_loader.count() != 0:
                        progressUpdateCallback(
                            f"Sending waypoint {response.seq + 1}",
                            (response.seq + 1) / (new_loader.count()),
                        )

                    if response.seq == new_loader.count() - 1:
                        mission_ack_response = self.drone.wait_for_message(
                            "MISSION_ACK",
                            self.controller_id,
                            timeout=2,
                            condition_func=lambda msg: msg.mission_type == mission_type,
                        )

                        if mission_ack_response and mission_ack_response.type == 0:
                            self.drone.logger.info("Uploaded mission successfully")
                            if mission_type == TYPE_MISSION:
                                self.missionLoader = new_loader
                            elif mission_type == TYPE_FENCE:
                                self.fenceLoader = new_loader
                            else:
                                self.rallyLoader = new_loader

                            return {
                                "success": True,
                                "message": "Mission uploaded successfully",
                            }
                        else:
                            self.drone.logger.error(
                                f"Error uploading mission, mission ack response: {mission_ack_response.type if mission_ack_response else 'None'}"
                            )
                            return {
                                "success": False,
                                "message": "Could not upload mission, not received mission acknowledgement",
                            }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Could not upload mission, serial exception",
            }
        finally:
            self.drone.sending_command_lock.release()
            self.drone.release_message_type("MISSION_REQUEST", self.controller_id)
            self.drone.release_message_type("MISSION_ACK", self.controller_id)

    def importMissionFromFile(self, mission_type: int, file_path: str) -> Response:
        """
        Imports a mission from a file, return the waypoints loaded.

        This is a wrapper method that calls the standalone importMissionFromFile function
        with the drone's target_system and target_component.

        Args:
            mission_type (int): The type of mission to import. 0=Mission,1=Fence,2=Rally.
            file_path (str): The path to the waypoint file to import.
        """
        return importMissionFromFile(
            mission_type,
            file_path,
            target_system=self.drone.target_system,
            target_component=self.drone.target_component,
        )

    def exportMissionToFile(
        self, mission_type: int, file_path: str, waypoints: List[dict]
    ) -> Response:
        """
        Exports a mission to a file.

        This is a wrapper method that calls the standalone exportMissionToFile function
        with the drone's target_system and target_component.

        Args:
            mission_type (int): The type of mission to export. 0=Mission,1=Fence,2=Rally.
            file_path (str): The path to the waypoint file to export.
            waypoints (list): The list of waypoints to export.
        """
        return exportMissionToFile(
            mission_type,
            file_path,
            waypoints,
            target_system=self.drone.target_system,
            target_component=self.drone.target_component,
        )
