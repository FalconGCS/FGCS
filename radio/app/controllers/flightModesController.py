from __future__ import annotations

import time
from threading import current_thread
from typing import TYPE_CHECKING, List, Union

import serial
from app.customTypes import Number, Response, VehicleType
from app.utils import commandAccepted, sendingCommandLock
from pymavlink import mavutil

if TYPE_CHECKING:
    from app.drone import Drone


FLIGHT_MODES = [
    "FLTMODE1",
    "FLTMODE2",
    "FLTMODE3",
    "FLTMODE4",
    "FLTMODE5",
    "FLTMODE6",
]


class FlightModesController:
    def __init__(self, drone: Drone) -> None:
        """
        The flight modes class controls all flight mode related actions.

        Args:
            drone (Drone): The main drone object
        """
        self.controller_id = f"flightmodes_{current_thread().ident}"

        self.drone = drone

        self.flight_modes: List[Union[str, float]] = []
        self.flight_mode_channel: Union[Number, str] = "UNKNOWN"

        self.getFlightModes()
        self.getFlightModeChannel()

    def getFlightModes(self) -> None:
        """
        Get the current flight modes of the drone."""
        self.drone.logger.debug("Fetching flight modes from cache")
        self.flight_modes = []
        for mode in FLIGHT_MODES:
            self.flight_modes.append(
                self.drone.paramsController.getSingleParam(mode).get(
                    "param_value", "UNKNOWN"
                )
            )

    def getFlightModeChannel(self) -> None:
        """
        Get the flight mode channel of the drone."""
        self.drone.logger.debug("Fetching flight mode channel from cache")
        self.flight_mode_channel = self.drone.paramsController.getSingleParam(
            "FLTMODE_CH"
        ).get("param_value", "UNKNOWN")

    def refreshData(self) -> None:
        """
        Refresh the flight mode data."""
        self.getFlightModes()
        self.getFlightModeChannel()

    def setFlightMode(self, mode_number: int, flight_mode: int) -> Response:
        """
        Set the flight mode of the drone.

        Args:
            mode_number (int): The flight mode number
            flight_mode (int): The flight mode to set
        Returns:
            A message showing if the flight mode number was successfully set to the flight mode
        """

        if mode_number < 1 or mode_number > 6:
            self.drone.logger.error(
                f"Invalid flight mode number, must be between 1 and 6 inclusive, got {mode_number}."
            )
            return {
                "success": False,
                "message": f"Invalid flight mode number, must be between 1 and 6 inclusive, got {mode_number}.",
            }

        if self.drone.aircraft_type == VehicleType.FIXED_WING.value:
            if (flight_mode < 0) or (flight_mode > 24):
                return {
                    "success": False,
                    "message": f"Invalid plane flight mode, must be between 0 and 24 inclusive, got {flight_mode}",
                }
            mode_name = mavutil.mavlink.enums["PLANE_MODE"][flight_mode].name
        else:
            if (flight_mode < 0) or (flight_mode > 27):
                return {
                    "success": False,
                    "message": f"Invalid copter flight mode, must be between 0 and 27 inclusive, got {flight_mode}",
                }
            mode_name = mavutil.mavlink.enums["COPTER_MODE"][flight_mode].name

        param_type = mavutil.mavlink.MAV_PARAM_TYPE_UINT8
        param_set_success = self.drone.paramsController.setParam(
            f"FLTMODE{mode_number}", flight_mode, param_type
        )

        if param_set_success:
            self.drone.logger.info(f"Flight mode {mode_number} set to {mode_name}")
            self.flight_modes[mode_number - 1] = flight_mode

            return {
                "success": True,
                "message": f"Flight mode {mode_number} set to {mode_name}",
                "data": {"param_id": f"FLTMODE{mode_number}", "value": flight_mode},
            }
        else:
            return {
                "success": False,
                "message": f"Failed to set flight mode {mode_number} to {mode_name}",
            }

    def setFlightModeChannel(self, channel: int) -> Response:
        """
        Set the flight mode channel of the drone.

        Args:
            channel (int): The flight mode channel to set
        """
        if channel < 1 or channel > 16:
            self.drone.logger.error(
                f"Invalid flight mode channel, must be between 1 and 16 inclusive, got {channel}."
            )
            return {
                "success": False,
                "message": f"Invalid flight mode channel, must be between 1 and 16 inclusive, got {channel}.",
            }

        param_type = mavutil.mavlink.MAV_PARAM_TYPE_UINT8
        param_set_success = self.drone.paramsController.setParam(
            "FLTMODE_CH", channel, param_type
        )

        if param_set_success:
            self.drone.logger.info(f"Flight mode channel set to {channel}")
            self.flight_mode_channel = channel

            return {
                "success": True,
                "message": f"Flight mode channel set to {channel}",
                "data": {"param_id": "FLTMODE_CH", "value": channel},
            }
        else:
            return {
                "success": False,
                "message": f"Failed to set flight mode channel to {channel}",
            }

    @sendingCommandLock
    def setCurrentFlightMode(self, flightMode: int) -> Response:
        """
        Sends a Mavlink message to the drone for setting its current flight mode

        Args:
            flightmode (int): The numeric value for the current flight mode setting
        Returns:
            A message to show if the drone received the message and successfully set the new mode
        """
        if not self.drone.reserve_message_type("COMMAND_ACK", self.controller_id):
            return {
                "success": False,
                "message": "Could not reserve COMMAND_ACK messages",
            }
        time.sleep(0.3)

        try:
            self.drone.sendCommand(
                message=mavutil.mavlink.MAV_CMD_DO_SET_MODE,
                param1=1,
                param2=flightMode,
                param3=0,
                param4=0,
                param5=0,
                param6=0,
                param7=0,
            )

            response = self.drone.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: msg.command
                == mavutil.mavlink.MAV_CMD_DO_SET_MODE,
            )

            if commandAccepted(response, mavutil.mavlink.MAV_CMD_DO_SET_MODE):
                self.drone.logger.info("Flight mode set successfully")
                return {"success": True, "message": "Flight mode set successfully"}
            else:
                return {
                    "success": False,
                    "message": "Could not set flight mode, command not accepted",
                }
        except serial.serialutil.SerialException:
            return {
                "success": False,
                "message": "Could not set flight mode, serial exception",
            }
        finally:
            self.drone.release_message_type("COMMAND_ACK", self.controller_id)

    def setGuidedMode(self) -> Response:
        """
        Set the drone's flight mode to Guided mode.
        Returns:
            A message to show if the drone received the message and successfully set the new mode
        """

        mode = mavutil.mavlink.COPTER_MODE_GUIDED

        if self.drone.aircraft_type == VehicleType.FIXED_WING.value:
            mode = mavutil.mavlink.PLANE_MODE_GUIDED

        return self.setCurrentFlightMode(mode)

    def getConfig(self) -> dict:
        """
        Get the current flight modes and flight mode channel from cached parameters.

        Returns:
            dict: The flight modes and flight mode channel of the drone
        """
        self.flight_mode_channel = self.drone.paramsController.getSingleParam(
            "FLTMODE_CH"
        ).get("param_value", "UNKNOWN")
        self.flight_modes = []
        for mode in FLIGHT_MODES:
            self.flight_modes.append(
                self.drone.paramsController.getSingleParam(mode).get(
                    "param_value", "UNKNOWN"
                )
            )

        return {
            "flight_modes": self.flight_modes,
            "flight_mode_channel": self.flight_mode_channel,
        }
