import {
  setHeartbeatData,
  resetHeartbeatMonitor,
  setHeartbeatMonitorLastReceivedAt,
} from "../slices/droneInfoSlice"
import { setConnected } from "../slices/droneConnectionSlice"
import { socketDisconnected } from "../slices/socketSlice"

const heartbeatMonitorMiddleware = (store) => {
  return (next) => (action) => {
    const result = next(action)

    if (setConnected.match(action)) {
      if (action.payload === true) {
        store.dispatch(setHeartbeatMonitorLastReceivedAt(Date.now()))
      } else if (action.payload === false) {
        store.dispatch(resetHeartbeatMonitor())
      }
    }

    if (socketDisconnected.match(action)) {
      store.dispatch(resetHeartbeatMonitor())
    }

    if (setHeartbeatData.match(action)) {
      store.dispatch(setHeartbeatMonitorLastReceivedAt(Date.now()))
    }

    return result
  }
}

export default heartbeatMonitorMiddleware
