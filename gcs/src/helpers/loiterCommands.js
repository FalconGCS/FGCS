const MAV_CMD_NAV_LOITER_UNLIM = 17
const MAV_CMD_NAV_LOITER_TURNS = 18
const MAV_CMD_NAV_LOITER_TIME = 19
const MAV_CMD_NAV_LOITER_TO_ALT = 31

export const LOITER_RADIUS_PARAMS = {
  [MAV_CMD_NAV_LOITER_UNLIM]: "param3",
  [MAV_CMD_NAV_LOITER_TURNS]: "param3",
  [MAV_CMD_NAV_LOITER_TIME]: "param3",
  [MAV_CMD_NAV_LOITER_TO_ALT]: "param2",
}

export function getLoiterRadiusMeters(item) {
  const radiusParam = LOITER_RADIUS_PARAMS[item?.command]
  if (radiusParam === undefined) return null

  const radius = Math.abs(Number(item[radiusParam]))
  if (!Number.isFinite(radius) || radius === 0) return null

  return radius
}

export function getLoiterDistanceMeters(item) {
  if (item?.command !== MAV_CMD_NAV_LOITER_TURNS) return 0

  const radius = getLoiterRadiusMeters(item)
  if (radius === null) return 0

  const turns = Math.abs(Number(item.param1))
  if (!Number.isFinite(turns) || turns === 0) return 0

  return turns * 2 * Math.PI * radius
}
