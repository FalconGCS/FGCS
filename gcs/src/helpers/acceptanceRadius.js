const MAV_CMD_NAV_WAYPOINT = 16

export function getAcceptanceRadiusMeters(item, defaultRadiusMeters) {
  if (item?.command !== MAV_CMD_NAV_WAYPOINT) return null

  const override = Number(item.param2)
  if (Number.isFinite(override) && override > 0) return override

  const fallback = Number(defaultRadiusMeters)
  if (!Number.isFinite(fallback) || fallback <= 0) return null

  return fallback
}
