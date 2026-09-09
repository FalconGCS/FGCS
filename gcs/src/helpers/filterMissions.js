import { MAV_FRAME_LIST } from "./mavlinkConstants"

export function filterMissionItems(missionItems) {
  if (!missionItems || !Array.isArray(missionItems)) {
    return []
  }

  const filteredMissionItems = []
  const missionItemsCopy = [...missionItems]

  if (missionItemsCopy !== undefined) {
    // Check if first item is a home command
    if (
      missionItemsCopy.length > 0 &&
      isGlobalFrameHomeCommand(missionItemsCopy[0])
    ) {
      // Remove the first item if it is a home command
      missionItemsCopy.shift()
    }

    // Filter out items with x or y as 0 (no coordinates)
    for (const missionItem of missionItemsCopy) {
      if (missionItem.x !== 0 && missionItem.y !== 0) {
        filteredMissionItems.push(missionItem)
      }
    }
  }

  return filteredMissionItems
}

export function isGlobalFrameHomeCommand(waypoint) {
  const globalFrameValue = parseInt(
    Object.keys(MAV_FRAME_LIST).find((key) => MAV_FRAME_LIST[key] === "GLOBAL"),
  )
  return (
    waypoint.frame === globalFrameValue &&
    waypoint.x !== 0 &&
    waypoint.y !== 0 &&
    waypoint.command === 16
  )
}
