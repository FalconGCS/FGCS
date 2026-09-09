"""
Global values to be used by the endpoints. We aren't sure if this is fully the correct way of doing this but it seems to work. Each file
imports this and access it, it can update the values and every other file will also have the update due to passing by reference (probably).
"""

from threading import Event, Lock
from typing import List, Optional

from app.drone import Drone

correct_ports: List[str] = []
drone: Optional[Drone] = None
state: Optional[str] = None
connection_state_lock: Lock = Lock()
connection_in_progress: bool = False
connect_cancel_event: Optional[Event] = None
