// Central registry for checklist state bindings, used for both UI and checklist slice

export const CHECKLIST_AUTO_BINDINGS = Object.freeze({
  // Handled in checklist slice
  DroneConnected: Object.freeze({
    key: "drone.connected",
    label: "Drone Connected",
  }),
  GpsSatsGt10: Object.freeze({
    key: "gps.sats.gt10",
    label: "GPS sats > 10",
  }),
  GpsHdopLt1: Object.freeze({
    key: "gps.hdop.lt1",
    label: "GPS hdop < 1",
  }),
  GpsFixGte3: Object.freeze({
    key: "gps.fix.gte3",
    label: "GPS fix >= 3",
  }),
  CompassHealthy: Object.freeze({
    key: "compass.healthy",
    label: "Compass Healthy",
  }),
  // AccelerometerHealthy: Object.freeze({
  //   key: "accelerometer.healthy",
  //   label: "Accelerometer Healthy",
  // }),

  // Handled in the socket middleware
  EkfAllGreen: Object.freeze({
    key: "ekf.all.green",
    label: "EKF all green",
  }),

  // For future: Look into how laptop battery could be used, this will likely be
  // in the middleware?
})

export const CHECKLIST_AUTO_BINDING_OPTIONS = Object.freeze(
  Object.values(CHECKLIST_AUTO_BINDINGS),
)
