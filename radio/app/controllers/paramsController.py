from __future__ import annotations

import struct
import time
from threading import current_thread
from typing import TYPE_CHECKING, Callable, List, Optional, Union

import serial
from app.customTypes import IncomingParam, Number, Response
from app.utils import sendingCommandLock
from pymavlink import mavutil
from typing_extensions import TypedDict

if TYPE_CHECKING:
    from app.drone import Drone


class CachedParam(TypedDict):
    param_id: str
    param_value: Number
    param_type: int


class ParamsController:
    def __init__(self, drone: Drone) -> None:
        """
        The Params controller controls all parameter related operations.

        Args:
            drone (Drone): The main drone object
        """
        self.controller_id: str = f"params_{current_thread().ident}"
        self.drone: Drone = drone
        self.params: List[CachedParam] = []
        self.current_param_index: int = 0
        self.current_param_id: str = ""
        self.total_number_of_params: int = 0
        self.is_requesting_params: bool = False

    def _resetFetchState(self) -> None:
        self.is_requesting_params = False
        self.current_param_index = 0
        self.current_param_id = ""
        self.total_number_of_params = 0

    def _startFetchAll(self) -> Response:
        """
        Starts the process of fetching all parameters from the drone.
        """
        if not self.drone.reserve_message_type("PARAM_VALUE", self.controller_id):
            self.drone.logger.error(
                "Could not reserve PARAM_VALUE messages for getAllParams"
            )
            return {
                "success": False,
                "message": "Could not reserve PARAM_VALUE messages",
            }

        self.is_requesting_params = True
        self.current_param_index = 0
        self.current_param_id = ""
        self.total_number_of_params = 0
        self.params = []

        # Wait so param_fetch_all does not silently return
        start = getattr(self.drone.master, "param_fetch_start", 0.0)
        elapsed = time.time() - start
        time.sleep(max(0.0, 2.0 - elapsed))

        self.drone.master.param_fetch_all()
        return {
            "success": True,
            "message": "Started fetching all parameters",
        }

    def fetchAllParamsBlocking(
        self,
        timeout_secs: int = 120,
        progress_update_callback: Optional[Callable[[dict], None]] = None,
        should_cancel_callback: Optional[Callable[[], bool]] = None,
    ) -> Response:
        """
        Fetches all parameters from the drone in a blocking manner.
        """
        if should_cancel_callback and should_cancel_callback():
            return {
                "success": False,
                "message": "Connection cancelled by user.",
            }

        start_response = self._startFetchAll()
        if not start_response.get("success"):
            return start_response

        timeout = time.time() + timeout_secs

        try:
            while self.is_requesting_params:
                if should_cancel_callback and should_cancel_callback():
                    self.drone.logger.info("Parameter fetch cancelled by user")
                    return {
                        "success": False,
                        "message": "Connection cancelled by user.",
                    }

                if time.time() > timeout:
                    self.drone.logger.error(
                        f"Fetching all parameters timed out after {timeout_secs} seconds"
                    )
                    self.params = []
                    return {
                        "success": False,
                        "message": f"Fetching all parameters timed out after {timeout_secs} seconds.",
                    }

                msg = self.drone.wait_for_message(
                    "PARAM_VALUE",
                    self.controller_id,
                    timeout=1.0,
                )

                if not msg:
                    continue

                self.saveParam(msg.param_id, msg.param_value, msg.param_type)

                self.current_param_index = msg.param_index
                self.current_param_id = msg.param_id
                self.total_number_of_params = msg.param_count

                if progress_update_callback:
                    progress_update_callback(
                        {
                            "current_param_index": self.current_param_index,
                            "current_param_id": self.current_param_id,
                            "total_number_of_params": self.total_number_of_params,
                        }
                    )

                if msg.param_index == msg.param_count - 1:
                    self.params = sorted(self.params, key=lambda k: k["param_id"])
                    self.drone.logger.info("Got all params")
                    return {
                        "success": True,
                        "message": "Got all params",
                        "data": self.params,
                    }

            return {
                "success": False,
                "message": "Parameter fetching stopped before completion.",
            }
        except Exception as e:
            self.drone.logger.error(e, exc_info=True)
            self.params = []
            return {
                "success": False,
                "message": f"Exception while fetching parameters: {str(e)}",
            }
        finally:
            self._resetFetchState()
            self.drone.release_message_type("PARAM_VALUE", self.controller_id)

    def setMultipleParams(
        self,
        params_list: list[IncomingParam],
        progress_update_callback: Optional[Callable],
    ) -> Response:
        """
        Sets multiple parameters on the drone.

        Args:
            params_list (list[IncomingParam]): The list of parameters to set

        Returns:
            bool: True if all parameters were set, False if any failed
        """
        if not params_list:
            return {"success": False, "message": "No parameters to set"}

        params_set_successfully = []
        params_could_not_set = []
        total_num_of_params = len(params_list)

        try:
            for idx, param in enumerate(params_list):
                param_id = param.get("param_id", None)
                param_value = param.get("param_value", None)
                param_type = param.get("param_type", None)
                param.pop("initial_value", None)  # Remove initial value if it exists

                if param_id is None or param_value is None:
                    self.drone.logger.error(
                        f"Invalid parameter data: {param}, skipping"
                    )
                    continue

                done = self.setParam(param_id, param_value, param_type)
                progress_update_callback_data = {
                    "param_id": param_id,
                    "current_index": idx + 1,
                    "total_params": total_num_of_params,
                }
                if not done:
                    params_could_not_set.append(param)
                    progress_update_callback_data["message"] = (
                        f"Failed to write {param_id}"
                    )
                else:
                    params_set_successfully.append(param)
                    progress_update_callback_data["message"] = (
                        f"Wrote {param_id} successfully"
                    )

                if progress_update_callback:
                    progress_update_callback(progress_update_callback_data)

            response_message = "All parameters set successfully"

            if len(params_could_not_set) and len(params_set_successfully):
                # Some params got set but some didn't
                response_message = f"Set {len(params_set_successfully)} parameters, but could not set {len(params_could_not_set)} parameters"
            elif len(params_could_not_set):
                # Some params did not get set and there are none set successfully or all of the params did not get set successfully
                response_message = (
                    f"Could not set {len(params_could_not_set)} parameters"
                )

            return {
                "success": True,
                "message": response_message,
                "data": {
                    "params_set_successfully": params_set_successfully,
                    "params_could_not_set": params_could_not_set,
                },
            }
        except Exception as e:
            self.drone.logger.error(
                "Exception while setting multiple params", exc_info=e
            )
            return {
                "success": False,
                "message": f"Exception while setting parameters: {str(e)}",
            }

    @sendingCommandLock
    def setParam(
        self,
        param_name: str,
        param_value: Number,
        param_type: Optional[int],
        retries: int = 3,
        save_timeout: Number = 1.5,
    ) -> bool:
        """
        Sets a single parameter on the drone.

        Args:
            param_name (str): The name of the parameter to set
            param_value (Number): The value to set the parameter to
            param_type (int): The type of the parameter
            retries (int, optional): The number of times a parameter will be attempted to be set. Defaults to 3.

        Returns:
            bool: True if the parameter was set, False if it failed
        """
        got_ack = False

        try:
            # Check if value fits inside the param type
            # https://github.com/ArduPilot/pymavlink/blob/4d8c4ff274d41b9bc8da1a411cb172d39786e46b/mavparm.py#L30C10-L30C10
            if (
                param_type is not None
                and param_type != mavutil.mavlink.MAV_PARAM_TYPE_REAL32
            ):
                # need to encode as a float for sending - not being used, just here to validate type I guess?
                if param_type == mavutil.mavlink.MAV_PARAM_TYPE_UINT8:
                    struct.pack(">xxxB", int(param_value))
                elif param_type == mavutil.mavlink.MAV_PARAM_TYPE_INT8:
                    struct.pack(">xxxb", int(param_value))
                elif param_type == mavutil.mavlink.MAV_PARAM_TYPE_UINT16:
                    struct.pack(">xxH", int(param_value))
                elif param_type == mavutil.mavlink.MAV_PARAM_TYPE_INT16:
                    struct.pack(">xxh", int(param_value))
                elif param_type == mavutil.mavlink.MAV_PARAM_TYPE_UINT32:
                    struct.pack(">I", int(param_value))
                elif param_type == mavutil.mavlink.MAV_PARAM_TYPE_INT32:
                    struct.pack(">i", int(param_value))
                else:
                    self.drone.logger.error(
                        "can't send %s of type %u" % (param_name, param_type)
                    )
                    return False
            vfloat = float(param_value)
        except (struct.error, ValueError) as e:
            self.drone.logger.error(
                f"Could not set parameter {param_name} with value {param_value}",
                exc_info=e,
            )
            return False

        if not self.drone.reserve_message_type("PARAM_VALUE", self.controller_id):
            self.drone.logger.error("Could not reserve PARAM_VALUE messages")
            return False

        # Ensure we try at least once
        if retries <= 0:
            retries = 1

        retries_remaining = retries

        try:
            # Keep trying to set the parameter until we get an ack or run out of retries or timeout
            while retries_remaining > 0 and not got_ack:
                retries_remaining -= 1
                self.drone.master.param_set_send(
                    param_name.upper(), vfloat, parm_type=param_type
                )

                ack = self.drone.wait_for_message(
                    "PARAM_VALUE",
                    self.controller_id,
                    save_timeout,
                )

                saved_param = False

                if ack:
                    got_ack = True
                    if ack.param_id.upper() != param_name.upper():
                        self.drone.logger.warning(
                            f"Parameter ack name mismatch: expected {param_name}, got {ack.param_id}"
                        )
                        got_ack = False
                        continue
                    elif abs(ack.param_value - param_value) > 0.0001:
                        # Use a small tolerance for float comparison
                        self.drone.logger.warning(
                            f"Could not set {param_name} to {param_value}, keeping value as {ack.param_value} instead. Trying again {retries_remaining} times."
                        )
                        self.drone.logger.debug(
                            f"Ack: {ack.to_dict()}, param_name: {param_name}, param_value: {param_value}"
                        )
                        got_ack = False
                        continue
                    else:
                        self.drone.logger.debug(
                            f"Got parameter saving ack for {param_name} for value {param_value}"
                        )
                        self.saveParam(ack.param_id, ack.param_value, ack.param_type)
                        saved_param = True
                        break

            if not got_ack:
                self.drone.logger.error(
                    f"Timeout setting {param_name} to {vfloat}, attempted {retries} times."
                )

            return saved_param
        except serial.serialutil.SerialException:
            self.drone.logger.error(f"Serial exception setting parameter {param_name}")
            return False
        finally:
            self.drone.release_message_type("PARAM_VALUE", self.controller_id)

    def saveParam(self, param_name: str, param_value: Number, param_type: int) -> None:
        """
        Save a parameter to the params list.

        Args:
            param_name (str): The name of the parameter
            param_value (Number): The value of the parameter
            param_type (int): The type of the parameter
        """
        existing_param_idx = next(
            (i for i, x in enumerate(self.params) if x["param_id"] == param_name), None
        )

        if existing_param_idx is not None:
            self.params[existing_param_idx]["param_value"] = param_value
        else:
            self.params.append(
                {
                    "param_id": param_name,
                    "param_value": param_value,
                    "param_type": param_type,
                }
            )

    def getSingleParam(self, param_id: str) -> Union[CachedParam, dict]:
        """
        Get a single parameter from the cached params.

        Args:
            param_id (str): The ID of the parameter to get
        """
        if isinstance(param_id, str):
            try:
                return next((x for x in self.params if x["param_id"] == param_id))
            except StopIteration:
                self.drone.logger.error(f"Param {param_id} not found in cached params")
                return {}
        else:
            self.drone.logger.error(f"Invalid param_id type, got {type(param_id)}")
            return {}

    def exportParamsToFile(self, file_path: str) -> Response:
        """
        Export all cached parameters to a file.

        Args:
            file_path (str): The path to the file to export to

        Returns:
            Response: The response from the export operation
        """
        try:
            with open(file_path, "w") as f:
                # order params alphabetically by param_id
                ordered_params = sorted(self.params, key=lambda k: k["param_id"])
                for param in ordered_params:
                    f.write(f"{param['param_id'].upper()},{param['param_value']}\n")
            return {
                "success": True,
                "message": f"Parameters exported successfully to {file_path}",
            }
        except Exception as e:
            self.drone.logger.error(f"Failed to export params to file: {e}")
            return {
                "success": False,
                "message": f"Failed to export params to file: {e}",
            }
