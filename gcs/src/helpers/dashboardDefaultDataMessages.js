const desiredDefaultMessages = [
  "VFR_HUD.throttle",
  "VFR_HUD.alt",
  "VFR_HUD.climb",
  "VFR_HUD.airspeed",
  "BATTERY_STATUS.current_consumed",
  "NAV_CONTROLLER_OUTPUT.wp_dist",
]

export const defaultDataMessages = desiredDefaultMessages.map((msg, idx) => {
  const [, field] = msg.split(".")
  return {
    boxId: idx,
    currently_selected: msg,
    display_name: field,
    value: 0,
  }
})
