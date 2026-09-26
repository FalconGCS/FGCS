from __future__ import annotations

from typing import TYPE_CHECKING

from app.customTypes import Number, VehicleType

if TYPE_CHECKING:
    from app.drone import Drone

COMMON_FAILSAFE_PARAMS = [
    "BATT_LOW_VOLT",
    "BATT_LOW_MAH",
    "BATT_FS_LOW_ACT",
    "BATT_CRT_VOLT",
    "BATT_CRT_MAH",
    "BATT_FS_CRT_ACT",
]

COPTER_FS_PARAMS = [
    "FS_THR_ENABLE",
    "RC_FS_TIMEOUT",
    "FS_GCS_TIMEOUT",
    "FS_GCS_ENABLE",
    "FS_EKF_THRESH",
    "FS_EKF_ACTION",
]

PLANE_FS_PARAMS = [
    "THR_FS_VALUE",
    "THR_FAILSAFE",
    "FS_GCS_ENABL",
    "FS_SHORT_ACTN",
    "FS_LONG_ACTN",
    "FS_SHORT_TIMEOUT",
    "FS_LONG_TIMEOUT",
]


class FailsafeController:
    def __init__(self, drone: Drone) -> None:
        self.drone = drone

        self.params: dict = {}

        self.valid_params = []
        if self.drone.aircraft_type == VehicleType.FIXED_WING.value:
            self.valid_params = COMMON_FAILSAFE_PARAMS + PLANE_FS_PARAMS
        if self.drone.aircraft_type == VehicleType.MULTIROTOR.value:
            self.valid_params = COMMON_FAILSAFE_PARAMS + COPTER_FS_PARAMS

        self.getFailsafeParams()

    def getConfig(self):
        config = {}
        for param in self.valid_params:
            self.params[param] = self.drone.paramsController.getSingleParam(param)
            config[param] = self.params[param].get("param_value", "UNKNOWN")

        return config

    def setFailsafeParam(self, param_id: str, value: Number) -> bool:
        """
        Sets a failsafe related parameter on the drone.
        """
        if param_id not in self.valid_params:
            self.drone.logger.error(
                f"Parameter {param_id} is not a valid failsafe parameter"
            )
            return False

        param_type = self.params.get(param_id, {}).get("param_type", None)

        return self.drone.paramsController.setParam(param_id, value, param_type)

    def getFailsafeParams(self) -> None:
        """
        Gets the gripper related parameters from the drone.
        """
        self.drone.logger.debug("Fetching gripper parameters")
        for param in self.valid_params:
            self.params[param] = self.drone.paramsController.getSingleParam(param)
