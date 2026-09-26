from __future__ import annotations

from typing import TYPE_CHECKING, Union

from app.customTypes import Number, VehicleType

if TYPE_CHECKING:
    from app.drone import Drone


class FrameController:
    def __init__(self, drone: Drone) -> None:
        """The frame class controls all frame class and type related actions

        Args:
            drone (Drone) : The main drone object
        """
        self.drone = drone

        self.frame_type: Union[Number, str] = "UNKNOWN"
        self.frame_class: Number = 0

        # Plane type doesn't have a frame type or class
        if self.drone.aircraft_type != VehicleType.FIXED_WING.value:
            self.getFrameType()
            self.getFrameClass()

    def getFrameType(self) -> None:
        """
        Gets the current frame type of the drone."""
        self.drone.logger.debug("Fetching frame type from cache")
        self.frame_type = self.drone.paramsController.getSingleParam("FRAME_TYPE").get(
            "param_value", "UNKNOWN"
        )

    def getFrameClass(self) -> None:
        """
        Gets the current frame class of the drone."""
        self.drone.logger.debug("Fetching frame class from cache")
        self.frame_class = self.drone.paramsController.getSingleParam(
            "FRAME_CLASS"
        ).get("param_value", 0)

    def getConfig(self) -> dict:
        """
        Get the current frame config from cached parameters.

        Returns:
            dict: The frame config of the drone
        """
        self.getFrameType()
        self.getFrameClass()

        return {
            "frame_type": self.frame_type,
            "frame_class": self.frame_class,
        }
