from __future__ import annotations

import time
from threading import current_thread
from typing import TYPE_CHECKING

import serial
from app.customTypes import Response, VehicleType
from app.utils import commandAccepted, sendingCommandLock
from pymavlink import mavutil

if TYPE_CHECKING:
    from app.drone import Drone


class NavController:
    def __init__(self, drone: Drone) -> None:
        """
        The Nav controller controls all navigation operations.

        Args:
            drone (Drone): The main drone object
        """
        self.controller_id = f"nav_{current_thread().ident}"
        self.drone = drone

        self.loiter_radius_param_type = mavutil.mavlink.MAV_PARAM_TYPE_INT16
        self.loiter_radius = 80.0  # Default loiter radius
        if (
            self.drone.aircraft_type == VehicleType.FIXED_WING.value
        ):  # Copter doesn't have loiter radius, only Plane
            self.getLoiterRadius()

    @sendingCommandLock
    def getHomePosition(self) -> Response:
        """
        Request the current home position from the drone.
        Retries up to 3 times with 1 second delay between attempts.
        """
        max_attempts = 3
        time_delay_between_attempts = 1

        if not self.drone.reserve_message_type("HOME_POSITION", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve HOME_POSITION messages",
            }

        for attempt in range(max_attempts):
            try:
                self.drone.sendCommand(
                    mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                    param1=mavutil.mavlink.MAVLINK_MSG_ID_HOME_POSITION,
                )

                response = self.drone.wait_for_message(
                    "HOME_POSITION", self.controller_id, timeout=1.5
                )

                if response:
                    self.drone.logger.info(
                        f"Home position received on attempt {attempt + 1}"
                    )

                    home_position = {
                        "lat": response.latitude,
                        "lon": response.longitude,
                        "alt": response.altitude,
                    }

                    return {
                        "success": True,
                        "message": "Home position received",
                        "data": home_position,
                    }
                else:
                    self.drone.logger.warning(
                        f"Could not get home position (attempt {attempt + 1}/{max_attempts})"
                    )

                    # If this isn't the last attempt, wait before retrying
                    if attempt < max_attempts - 1:
                        time.sleep(time_delay_between_attempts)

            except serial.serialutil.SerialException:
                self.drone.logger.warning(
                    f"Serial exception on attempt {attempt + 1}/{max_attempts}"
                )
                break
            finally:
                self.drone.release_message_type("HOME_POSITION", self.controller_id)

        # If we get here, all attempts have failed
        return {
            "success": False,
            "message": f"Could not get home position after {max_attempts} attempts",
        }

    @sendingCommandLock
    def setHomePosition(self, lat: float, lon: float, alt: float) -> Response:
        """
        Set the home point of the drone.

        Args:
            lat (float): The latitude of the home point
            lon (float): The longitude of the home point
            alt (float): The altitude of the home point
        """
        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        try:
            self.drone.sendCommandInt(
                mavutil.mavlink.MAV_CMD_DO_SET_HOME, x=lat, y=lon, z=alt
            )

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: msg.command
                == mavutil.mavlink.MAV_CMD_DO_SET_HOME,
            )

            if commandAccepted(response, mavutil.mavlink.MAV_CMD_DO_SET_HOME):
                return {
                    "success": True,
                    "message": "Home point set successfully",
                }
            else:
                return {
                    "success": False,
                    "message": "Could not set home point",
                }

        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Could not set home point, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    def takeoff(self, alt: float) -> Response:
        """
        Tells the drone to takeoff to a specified altitude.

        Args:
            alt (float): The altitude to take off to.

        Returns:
            Response: The response from the takeoff command
        """
        if alt < 0:
            return {
                "success": False,
                "message": f"Altitude cannot be negative, got {alt}",
            }

        guidedModeSetResult = self.drone.flightModesController.setGuidedMode()
        if not guidedModeSetResult["success"]:
            return guidedModeSetResult

        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        self.drone.sending_command_lock.acquire()

        try:
            self.drone.sendCommand(mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, param7=alt)

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: msg.command
                == mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
            )

            self.drone.sending_command_lock.release()

            if commandAccepted(response, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF):
                self.drone.logger.info("Takeoff command send successfully")
                return {"success": True, "message": "Takeoff command sent successfully"}
            else:
                return {
                    "success": False,
                    "message": "Could not takeoff",
                }

        except serial.serialutil.SerialException:
            self.drone.sending_command_lock.release()
            return {
                "success": False,
                "message": "Could not takeoff, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    @sendingCommandLock
    def land(self) -> Response:
        """
        Tells the drone to land.

        Returns:
            Response: The response from the land command
        """
        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }

        try:
            self.drone.sendCommand(mavutil.mavlink.MAV_CMD_NAV_LAND)

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: msg.command
                == mavutil.mavlink.MAV_CMD_NAV_LAND,
            )

            if commandAccepted(response, mavutil.mavlink.MAV_CMD_NAV_LAND):
                self.drone.logger.info("Land command send successfully")
                return {"success": True, "message": "Land command sent successfully"}
            else:
                return {
                    "success": False,
                    "message": "Could not land",
                }

        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Could not land, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    def reposition(self, lat: float, lon: float, alt: float) -> Response:
        """
        Tells the drone to reposition to the specified GPS coordinates.

        For fixed-wing aircraft (planes), this uses a mission waypoint with current=2
        to avoid overwriting the mission. For multirotors, this uses SET_POSITION_TARGET_GLOBAL_INT.

        Args:
            lat (float): The latitude to go to.
            lon (float): The longitude to go to.
            alt (float): The altitude to go to.

        Returns:
            Response: The response from the reposition command
        """
        guidedModeSetResult = self.drone.flightModesController.setGuidedMode()
        if not guidedModeSetResult["success"]:
            return guidedModeSetResult

        try:
            # drone.aircraft_type == 1 for fixed wing. Check customTypes.py
            if self.drone.aircraft_type == VehicleType.FIXED_WING.value:
                with self.drone.sending_command_lock:
                    # https://mavlink.io/en/messages/common.html#MISSION_ITEM_INT
                    # https://ardupilot.org/dev/docs/plane-commands-in-guided-mode.html
                    self.drone.master.mav.mission_item_int_send(
                        self.drone.target_system,
                        self.drone.target_component,
                        0,  # seq
                        mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                        mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
                        2,  # current=2 means guided mode target, doesn't overwrite mission
                        1,  # Autocontinue to next waypoint. 0: false, 1: true.
                        0,  # param1 (hold time)
                        self.loiter_radius,  # param2 (acceptance radius)
                        0,  # param3 (pass through waypoint)
                        float("nan"),  # param4 (desired yaw angle)
                        int(lat * 1e7),
                        int(lon * 1e7),
                        alt,  # altitude in meters
                        mavutil.mavlink.MAV_MISSION_TYPE_MISSION,
                    )

                self.drone.logger.info(
                    f"Reposition command (mission waypoint) sent to {lat}, {lon}, {alt}m for fixed-wing"
                )
            else:
                # ArduCopter/Multirotor uses SET_POSITION_TARGET_GLOBAL_INT
                with self.drone.sending_command_lock:
                    self.drone.master.mav.set_position_target_global_int_send(
                        0,
                        self.drone.target_system,
                        self.drone.target_component,
                        mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                        65016,  # Bitmask to ignore all values except for x, y and z
                        int(lat * 1e7),
                        int(lon * 1e7),
                        alt,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                    )

                self.drone.logger.info(
                    f"Reposition command sent to {lat}, {lon}, {alt}m for multirotor"
                )

            return {
                "success": True,
                "message": "Reposition command sent successfully",
                "data": {
                    "lat": lat,
                    "lon": lon,
                    "alt": alt,
                },
            }
        except serial.serialutil.SerialException:
            self.drone.logger.error("Reposition command not accepted, serial exception")
            return {
                "success": False,
                "message": "Could not reposition, serial exception",
            }

    def getLoiterRadius(self) -> Response:
        """
        Get the loiter radius of the drone from the cached parameters.

        Returns:
            Response: The response from the get loiter radius command
        """

        loiter_radius_data = self.drone.paramsController.getSingleParam("WP_LOITER_RAD")

        if loiter_radius_data.get("param_value") is None:
            self.drone.logger.warning("Loiter radius parameter not found in cache")
            return {
                "success": False,
                "message": "Loiter radius parameter not found in cache",
            }

        self.loiter_radius = loiter_radius_data.get("param_value", self.loiter_radius)

        return {
            "success": True,
            "data": self.loiter_radius,
        }

    def setLoiterRadius(self, radius: float) -> Response:
        """
        Set the loiter radius of the drone.

        Args:
            radius (float): The loiter radius in meters
        """

        param_set_success = self.drone.paramsController.setParam(
            "WP_LOITER_RAD", radius, self.loiter_radius_param_type
        )

        if param_set_success:
            self.drone.logger.info(f"Loiter radius set to {radius}m")
            self.loiter_radius = radius

            return {
                "success": True,
                "message": f"Loiter radius set to {radius}m",
            }
        else:
            return {
                "success": False,
                "message": f"Failed to set loiter radius set to {radius}m",
            }
