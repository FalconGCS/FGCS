/*
  Builds the lines that connect mission items together on the map.

  A mission is not always a single flight path. Markers like DO_RETURN_PATH_START
  and DO_LAND_START introduce alternative entry points, and DO_JUMP /
  DO_JUMP_TAG redirect the aircraft elsewhere in the mission. That makes the
  drawn path a set of branches rather than one polyline: several return paths can
  each end in a jump to the same landing sequence, which should show up as
  several separate lines converging on it.
*/

// MavCmd comes straight from the common dialect rather than through
// helpers/mavlinkDef, whose spread lets ardupilotmega's MavCmd -- which holds
// only the ArduPilot specific commands -- replace the common one, which would
// leave every command id here undefined.
import { MavCmd } from "mavlink-mappings/dist/lib/common"

import { intToCoord } from "./dataFormatters"

// Commands that end the branch of the mission that reaches them. Later items are
// still drawn, as their own branches, since they remain reachable by a jump or
// by a return path entry point.
export const BRANCH_END_COMMANDS = [
  MavCmd.NAV_RETURN_TO_LAUNCH,
  MavCmd.NAV_LAND,
  MavCmd.DO_LAND_START,
]

// param2 of a jump is how many times it repeats. -1 repeats forever, so the
// aircraft never continues past it to the following item.
const INFINITE_JUMP_REPEAT = -1

export function missionItemToCoord(item) {
  return [intToCoord(item.y), intToCoord(item.x)]
}

function isJumpCommand(command) {
  return command === MavCmd.DO_JUMP || command === MavCmd.DO_JUMP_TAG
}

/*
  The sequence number a jump sends the aircraft to, or null if it can't be
  resolved. DO_JUMP names the sequence number directly; DO_JUMP_TAG names a tag
  id that has to be looked up on a JUMP_TAG marker elsewhere in the mission.
*/
function resolveJumpTargetSeq(jumpItem, jumpTagSeqByTagId) {
  const param1 = Number(jumpItem.param1)
  if (!Number.isFinite(param1)) return null

  if (jumpItem.command === MavCmd.DO_JUMP) {
    return param1
  }

  const tagSeq = jumpTagSeqByTagId.get(param1)
  return tagSeq === undefined ? null : tagSeq
}

/*
  Whether the aircraft can ever carry on past a jump to the item after it.

  A jump only falls through once its repeat count is exhausted, which takes more
  than one pass over the jump, so the aircraft has to be able to reach the jump
  again. A jump backwards loops, and so is revisited: a survey pattern that
  repeats three times does eventually continue past the jump. A jump forwards
  sends the aircraft further down the mission and nothing brings it back, so the
  item after it is unreachable however the repeat count is set.
*/
function jumpCanFallThrough(jumpItem, targetSeq) {
  if (targetSeq === null) return true
  if (Number(jumpItem.param2) === INFINITE_JUMP_REPEAT) return false

  return targetSeq < jumpItem.seq
}

/*
  The one place that decides a run of waypoints is over, so branch drawing and
  return path grouping cannot drift apart on the rule.
*/
function endsRunAt(item, jumpTagSeqByTagId) {
  if (BRANCH_END_COMMANDS.includes(item.command)) return true

  if (isJumpCommand(item.command)) {
    const targetSeq = resolveJumpTargetSeq(item, jumpTagSeqByTagId)
    return !jumpCanFallThrough(item, targetSeq)
  }

  return false
}

/*
  The lookups every walk over a mission needs: the items in sequence order, the
  ones that have coordinates keyed by seq, and each JUMP_TAG id resolved to the
  sequence number carrying it.
*/
function indexMission(missionItems, positionalItems) {
  const sortedItems = [...missionItems].sort((a, b) => a.seq - b.seq)

  return {
    sortedItems,
    positionalBySeq: new Map(positionalItems.map((item) => [item.seq, item])),
    jumpTagSeqByTagId: new Map(
      sortedItems
        .filter((item) => item.command === MavCmd.JUMP_TAG)
        .map((item) => [Number(item.param1), item.seq]),
    ),
  }
}

/*
  Walks the mission in sequence order and returns the lines to draw.

  Returns `branches` (the sequential flight paths, in the order they start) and
  `jumpLegs` (a two point line per jump, from the last waypoint before the jump
  to the waypoint it lands on). They are kept apart so the caller can attach the
  home position to the first branch without a jump leg getting in the way.

  `positionalItems` are the mission items that have coordinates, as produced by
  filterMissionItems.
*/
export function buildMissionPathSegments(
  missionItems,
  positionalItems,
  homeCoord = null,
) {
  if (!Array.isArray(positionalItems) || positionalItems.length === 0) {
    return { branches: [], jumpLegs: [] }
  }

  const { sortedItems, positionalBySeq, jumpTagSeqByTagId } = indexMission(
    missionItems,
    positionalItems,
  )
  const positionalSeqs = [...positionalBySeq.keys()].sort((a, b) => a - b)

  // A jump can target a marker that has no coordinates of its own, such as a
  // JUMP_TAG, so walk forward to the first item that can actually be drawn.
  function firstPositionalItemFrom(seq) {
    const foundSeq = positionalSeqs.find((candidate) => candidate >= seq)
    return foundSeq === undefined ? null : positionalBySeq.get(foundSeq)
  }

  const branches = []
  const jumpLegs = []

  let currentBranch = []
  let lastItem = null

  function endBranch() {
    // A branch of one point has no line to draw
    if (currentBranch.length > 1) {
      branches.push(currentBranch)
    }
    currentBranch = []
    lastItem = null
  }

  for (const item of sortedItems) {
    if (isJumpCommand(item.command)) {
      if (lastItem !== null) {
        const targetSeq = resolveJumpTargetSeq(item, jumpTagSeqByTagId)
        const targetItem =
          targetSeq === null ? null : firstPositionalItemFrom(targetSeq)

        if (targetItem !== null && targetItem.seq !== lastItem.seq) {
          jumpLegs.push([
            missionItemToCoord(lastItem),
            missionItemToCoord(targetItem),
          ])
        }
      }

      if (endsRunAt(item, jumpTagSeqByTagId)) {
        endBranch()
      }
      continue
    }

    const positionalItem = positionalBySeq.get(item.seq)
    if (positionalItem !== undefined) {
      currentBranch.push(missionItemToCoord(positionalItem))
      lastItem = positionalItem
    }

    if (endsRunAt(item, jumpTagSeqByTagId)) {
      // Returning to launch flies back to home, so draw that leg
      if (item.command === MavCmd.NAV_RETURN_TO_LAUNCH && homeCoord !== null) {
        currentBranch.push(homeCoord)
      }
      endBranch()
    }
  }

  endBranch()

  return { branches, jumpLegs }
}

/*
  Groups waypoints by the return path they belong to, so each return path can be
  drawn in its own colour.

  A DO_RETURN_PATH_START claims two sets of waypoints:

    - the return path itself: every waypoint from the marker up to the end of
      that branch.

    - the stretch of the main mission it covers. param1 on the marker is the
      waypoint the aircraft has to be flying towards for the return path to
      trigger, so the return path becomes active one waypoint earlier, as soon
      as the waypoint before param1 is reached. Coverage therefore starts at
      param1 - 1 and runs until the next marker's param1 - 1, so consecutive
      markers carve the main mission into ranges. A marker with param1 of 1 or
      less covers no range.

  Coverage stops at the first marker, since the waypoints beyond it belong to the
  return paths and the shared landing sequence rather than to the main mission
  the aircraft flies through. Where the two sets overlap, belonging to a return
  path wins over merely being covered by one.

  Keyed on seq rather than the client side id, because mission items read
  straight from the drone onto the dashboard have no id attached.

  Returns `groupBySeq`, a Map of waypoint seq -> zero based return path index in
  mission order for the caller to map onto a colour, and `entrySeqs`, the seq of
  the waypoint each return path begins at so it can be marked out from the rest
  of its sequence.
*/
export function getReturnPathGroupsBySeq(missionItems, positionalItems) {
  const empty = { groupBySeq: new Map(), entrySeqs: new Set() }

  if (!Array.isArray(positionalItems) || positionalItems.length === 0) {
    return empty
  }

  const { sortedItems, positionalBySeq, jumpTagSeqByTagId } = indexMission(
    missionItems,
    positionalItems,
  )

  const groupBySeq = new Map()
  const entrySeqs = new Set()
  const markers = []

  // One pass claiming the waypoints of each return path. The paths are disjoint
  // and in mission order, so an open path is closed by the next marker or by
  // whatever ends its run.
  let openPath = null

  for (const item of sortedItems) {
    if (item.command === MavCmd.DO_RETURN_PATH_START) {
      markers.push(item)
      openPath = { index: markers.length - 1, hasEntry: false }
      continue
    }

    if (openPath === null) continue

    if (positionalBySeq.has(item.seq)) {
      groupBySeq.set(item.seq, openPath.index)

      if (!openPath.hasEntry) {
        entrySeqs.add(item.seq)
        openPath.hasEntry = true
      }
    }

    if (endsRunAt(item, jumpTagSeqByTagId)) {
      openPath = null
    }
  }

  if (markers.length === 0) return empty

  // The stretch of the main mission each return path covers
  const firstMarkerSeq = markers[0].seq

  markers.forEach((marker, index) => {
    const triggerTarget = Number(marker.param1)
    if (!Number.isFinite(triggerTarget) || triggerTarget <= 1) return

    // Active from the waypoint whose arrival makes param1 the target
    const coverFrom = triggerTarget - 1

    const nextTriggerTarget = Number(markers[index + 1]?.param1)
    const coverUntil = Math.min(
      Number.isFinite(nextTriggerTarget) && nextTriggerTarget > triggerTarget
        ? nextTriggerTarget - 1
        : Infinity,
      firstMarkerSeq,
    )

    for (const item of positionalItems) {
      if (
        item.seq >= coverFrom &&
        item.seq < coverUntil &&
        !groupBySeq.has(item.seq)
      ) {
        groupBySeq.set(item.seq, index)
      }
    }
  })

  return { groupBySeq, entrySeqs }
}
