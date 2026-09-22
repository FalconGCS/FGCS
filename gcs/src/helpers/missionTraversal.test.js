import { distance } from "@turf/turf"
import { describe, expect, it } from "vitest"
import { coordToInt } from "./dataFormatters"
import { MAV_FRAME_LIST } from "./mavlinkConstants"
import {
  buildMissionTraversal,
  calculateMissionTotalDistance,
} from "./missionTraversal"

const COPTER = 2

const CMD = {
  WAYPOINT: 16,
  LAND: 21,
  TAKEOFF: 22,
  LOITER_UNLIM: 17,
  LOITER_TURNS: 18,
  LOITER_TIME: 19,
  LOITER_TO_ALT: 31,
  DO_JUMP: 177,
  DO_SET_ROI: 201,
  CONDITION_YAW: 115,
}

const frameId = (name) =>
  Number(
    Object.keys(MAV_FRAME_LIST).find((key) => MAV_FRAME_LIST[key] === name),
  )

const GLOBAL = frameId("GLOBAL")
const RELATIVE = frameId("GLOBAL_RELATIVE_ALT")

const HOME = { lat: 53.38, lon: -1.48 }
const NO_HOME = { lat: 0, lon: 0, alt: 0 }

function item(seq, command, lat, lon, extra = {}) {
  return {
    seq,
    command,
    frame: RELATIVE,
    x: lat === null ? 0 : coordToInt(lat),
    y: lon === null ? 0 : coordToInt(lon),
    z: 50,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    ...extra,
  }
}

function homeItem(lat = HOME.lat, lon = HOME.lon, alt = 100) {
  return { ...item(0, CMD.WAYPOINT, lat, lon), frame: GLOBAL, z: alt }
}

const home = (alt = 100) => ({
  lat: coordToInt(HOME.lat),
  lon: coordToInt(HOME.lon),
  alt,
})

/* Distance in metres along an explicit list of [lat, lon] pairs. */
function walk(...coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += distance(
      [coords[i - 1][1], coords[i - 1][0]],
      [coords[i][1], coords[i][0]],
      { units: "meters" },
    )
  }
  return total
}

const round = (value) => Math.round(value * 100) / 100

/* Invariants every traversal must hold, whatever the mission. */
function expectConsistent(traversal) {
  const { points, totalDistance } = traversal

  for (let i = 1; i < points.length; i++) {
    expect(points[i].cumulativeDistance).toBeGreaterThanOrEqual(
      points[i - 1].cumulativeDistance,
    )
  }

  for (const point of points) {
    expect(Number.isFinite(point.cumulativeDistance)).toBe(true)
    expect(Number.isFinite(point.altitude)).toBe(true)
    expect(Number.isFinite(point.lat)).toBe(true)
    expect(Number.isFinite(point.lon)).toBe(true)
  }

  // The graph's x axis has to end where the statistics panel says it does
  expect(totalDistance).toBe(
    points.length ? points[points.length - 1].cumulativeDistance : 0,
  )
}

describe("empty and degenerate missions", () => {
  it("returns nothing for an empty mission with no home", () => {
    const traversal = buildMissionTraversal([], COPTER, NO_HOME)
    expect(traversal).toEqual({ points: [], totalDistance: 0, warnings: [] })
  })

  it("returns just the home point for an empty mission with a home", () => {
    const traversal = buildMissionTraversal([], COPTER, home())
    expect(traversal.points).toHaveLength(1)
    expect(traversal.points[0]).toMatchObject({ isHome: true, label: "Home" })
    expect(traversal.totalDistance).toBe(0)
  })

  it("tolerates a non-array mission", () => {
    expect(buildMissionTraversal(null, COPTER, home()).totalDistance).toBe(0)
    expect(buildMissionTraversal(undefined, COPTER, NO_HOME).points).toEqual([])
  })

  it("is zero for a mission with a single waypoint and no home", () => {
    const traversal = buildMissionTraversal(
      [item(1, CMD.WAYPOINT, 53.39, -1.48)],
      COPTER,
      NO_HOME,
    )
    expect(traversal.totalDistance).toBe(0)
    expectConsistent(traversal)
  })
})

describe("home handling", () => {
  it("measures the first leg from home", () => {
    const items = [
      homeItem(),
      item(1, CMD.TAKEOFF, null, null),
      item(2, CMD.WAYPOINT, 53.39, -1.48),
      item(3, CMD.WAYPOINT, 53.39, -1.46),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())

    expect(traversal.totalDistance).toBe(
      round(walk([53.38, -1.48], [53.39, -1.48], [53.39, -1.46])),
    )
    expect(traversal.points.map((point) => point.seq)).toEqual([0, 2, 3])
    expectConsistent(traversal)
  })

  it("does not anchor the mission to 0,0 when no home is set", () => {
    const items = [
      item(1, CMD.TAKEOFF, null, null),
      item(2, CMD.WAYPOINT, 53.39, -1.48),
      item(3, CMD.WAYPOINT, 53.39, -1.46),
    ]

    const traversal = buildMissionTraversal(items, COPTER, NO_HOME)

    expect(traversal.totalDistance).toBe(
      round(walk([53.39, -1.48], [53.39, -1.46])),
    )
    expect(traversal.points.some((point) => point.isHome)).toBe(false)
    expectConsistent(traversal)
  })

  it("falls back to the mission's home item when no home is planned", () => {
    const items = [
      homeItem(),
      item(1, CMD.TAKEOFF, null, null),
      item(2, CMD.WAYPOINT, 53.39, -1.48),
    ]

    const traversal = buildMissionTraversal(items, COPTER, NO_HOME)

    expect(traversal.points[0]).toMatchObject({ isHome: true })
    expect(traversal.totalDistance).toBe(
      round(walk([53.38, -1.48], [53.39, -1.48])),
    )
  })

  it("prefers the planned home over the mission's home item", () => {
    const items = [homeItem(53.0, -1.0), item(1, CMD.WAYPOINT, 53.39, -1.48)]

    const traversal = buildMissionTraversal(items, COPTER, home())

    expect(traversal.totalDistance).toBe(
      round(walk([53.38, -1.48], [53.39, -1.48])),
    )
  })
})

describe("which commands count as distance flown", () => {
  it("ignores commands that carry coordinates but are not flown to", () => {
    const withRoi = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.DO_SET_ROI, 53.5, -1.0),
      item(3, CMD.CONDITION_YAW, 54.0, -2.0),
      item(4, CMD.WAYPOINT, 53.39, -1.46),
    ]
    const withoutRoi = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(4, CMD.WAYPOINT, 53.39, -1.46),
    ]

    expect(calculateMissionTotalDistance(withRoi, COPTER, home())).toBe(
      calculateMissionTotalDistance(withoutRoi, COPTER, home()),
    )
  })

  it("ignores waypoints without coordinates", () => {
    const items = [
      homeItem(),
      item(1, CMD.TAKEOFF, null, null),
      item(2, CMD.WAYPOINT, 53.39, -1.48),
      item(3, CMD.WAYPOINT, null, null),
      item(4, CMD.WAYPOINT, 53.39, -1.46),
    ]

    expect(calculateMissionTotalDistance(items, COPTER, home())).toBe(
      round(walk([53.38, -1.48], [53.39, -1.48], [53.39, -1.46])),
    )
  })

  it("counts a landing waypoint that has coordinates", () => {
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.LAND, 53.39, -1.46),
    ]

    expect(calculateMissionTotalDistance(items, COPTER, home())).toBe(
      round(walk([53.38, -1.48], [53.39, -1.48], [53.39, -1.46])),
    )
  })
})

describe("loiters", () => {
  const loiterItems = (command, extra) => [
    homeItem(),
    item(1, CMD.WAYPOINT, 53.39, -1.48),
    item(2, command, 53.39, -1.46, extra),
    item(3, CMD.WAYPOINT, 53.38, -1.46),
  ]

  const legsRaw = walk(
    [53.38, -1.48],
    [53.39, -1.48],
    [53.39, -1.46],
    [53.38, -1.46],
  )
  const legsOnly = round(legsRaw)

  it("adds the circles flown at a LOITER_TURNS", () => {
    const items = loiterItems(CMD.LOITER_TURNS, { param1: 3, param3: 100 })
    const traversal = buildMissionTraversal(items, COPTER, home())

    expect(traversal.totalDistance).toBe(round(legsRaw + 3 * 2 * Math.PI * 100))
    expectConsistent(traversal)
  })

  it("emits a second point at the loiter so the graph shows the circling", () => {
    const items = loiterItems(CMD.LOITER_TURNS, { param1: 2, param3: 75 })
    const { points } = buildMissionTraversal(items, COPTER, home())

    const loiterPoints = points.filter((point) => point.seq === 2)
    expect(loiterPoints).toHaveLength(2)
    expect(loiterPoints[0].lat).toBe(loiterPoints[1].lat)
    expect(loiterPoints[0].lon).toBe(loiterPoints[1].lon)
    expect(loiterPoints[0].altitude).toBe(loiterPoints[1].altitude)
    expect(
      round(
        loiterPoints[1].cumulativeDistance - loiterPoints[0].cumulativeDistance,
      ),
    ).toBe(round(2 * 2 * Math.PI * 75))
    // The repeated point must not draw a second waypoint label
    expect(loiterPoints[1].label).toBe("")
  })

  it("adds nothing for loiters that do not fly a known number of circles", () => {
    for (const command of [
      CMD.LOITER_UNLIM,
      CMD.LOITER_TIME,
      CMD.LOITER_TO_ALT,
    ]) {
      const items = loiterItems(command, {
        param1: 3,
        param2: 100,
        param3: 100,
      })
      expect(calculateMissionTotalDistance(items, COPTER, home())).toBe(
        legsOnly,
      )
    }
  })

  it("adds nothing for a LOITER_TURNS with no turns or no radius", () => {
    expect(
      calculateMissionTotalDistance(
        loiterItems(CMD.LOITER_TURNS, { param1: 0, param3: 100 }),
        COPTER,
        home(),
      ),
    ).toBe(legsOnly)

    expect(
      calculateMissionTotalDistance(
        loiterItems(CMD.LOITER_TURNS, { param1: 3, param3: 0 }),
        COPTER,
        home(),
      ),
    ).toBe(legsOnly)
  })

  it("counts negative turns and radius as circles flown", () => {
    const items = loiterItems(CMD.LOITER_TURNS, { param1: -2, param3: -50 })
    expect(calculateMissionTotalDistance(items, COPTER, home())).toBe(
      round(legsRaw + 2 * 2 * Math.PI * 50),
    )
  })

  it("counts every pass of a loiter inside a jump loop", () => {
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.LOITER_TURNS, 53.39, -1.46, { param1: 1, param3: 100 }),
      item(3, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
    ]

    const circumference = 2 * Math.PI * 100
    const legs = walk(
      [53.38, -1.48],
      [53.39, -1.48],
      [53.39, -1.46],
      [53.39, -1.48],
      [53.39, -1.46],
    )

    expect(calculateMissionTotalDistance(items, COPTER, home())).toBe(
      round(legs + 2 * circumference),
    )
  })
})

describe("DO_JUMP expansion", () => {
  // An asymmetric loop, so an out and back leg cannot cancel out a mistake
  const loop = (jumpExtra) => [
    homeItem(),
    item(1, CMD.WAYPOINT, 53.39, -1.48),
    item(2, CMD.WAYPOINT, 53.4, -1.44),
    item(3, CMD.WAYPOINT, 53.37, -1.42),
    item(4, CMD.DO_JUMP, null, null, jumpExtra),
    item(5, CMD.WAYPOINT, 53.36, -1.5),
  ]

  const A = [53.39, -1.48]
  const B = [53.4, -1.44]
  const C = [53.37, -1.42]
  const D = [53.36, -1.5]
  const H = [53.38, -1.48]

  it("flies the loop once more for each repeat", () => {
    const traversal = buildMissionTraversal(
      loop({ param1: 1, param2: 2 }),
      COPTER,
      home(),
    )

    expect(traversal.totalDistance).toBe(
      round(walk(H, A, B, C, A, B, C, A, B, C, D)),
    )
    expect(traversal.points.map((point) => point.seq)).toEqual([
      0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 5,
    ])
    expectConsistent(traversal)
  })

  it("does not repeat when the jump count is zero", () => {
    expect(
      calculateMissionTotalDistance(
        loop({ param1: 1, param2: 0 }),
        COPTER,
        home(),
      ),
    ).toBe(round(walk(H, A, B, C, D)))
  })

  it("ignores a jump to a sequence number that is not in the mission", () => {
    expect(
      calculateMissionTotalDistance(
        loop({ param1: 99, param2: 3 }),
        COPTER,
        home(),
      ),
    ).toBe(round(walk(H, A, B, C, D)))
  })

  it("ignores a jump to itself instead of hanging", () => {
    expect(
      calculateMissionTotalDistance(
        loop({ param1: 4, param2: 5 }),
        COPTER,
        home(),
      ),
    ).toBe(round(walk(H, A, B, C, D)))
  })

  it("walks an infinite jump once and says so", () => {
    const traversal = buildMissionTraversal(
      loop({ param1: 1, param2: -1 }),
      COPTER,
      home(),
    )

    expect(traversal.totalDistance).toBe(round(walk(H, A, B, C, A, B, C, D)))
    expect(traversal.warnings).toEqual([
      "DO_JUMP at waypoint 4 is infinite. Graph includes one repeated pass only.",
    ])
    expectConsistent(traversal)
  })

  it("warns only once about an infinite jump reached twice", () => {
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.DO_JUMP, null, null, { param1: 1, param2: -1 }),
      item(3, CMD.WAYPOINT, 53.4, -1.44),
      item(4, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())
    expect(traversal.warnings).toHaveLength(1)
    expectConsistent(traversal)
  })

  it("handles a jump backwards to the home sequence number", () => {
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.DO_JUMP, null, null, { param1: 0, param2: 1 }),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())
    expect(traversal.totalDistance).toBe(round(walk(H, A, A)))
    expectConsistent(traversal)
  })

  it("keeps a nested loop's counter across passes of the outer loop", () => {
    // Inner jump repeats seq 1 once, outer jump repeats the whole block once.
    // The autopilot's repeat counters are per item and are not reset by the
    // outer loop, so the inner jump fires only on the first pass.
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.WAYPOINT, 53.4, -1.44),
      item(3, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
      item(4, CMD.WAYPOINT, 53.37, -1.42),
      item(5, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
      item(6, CMD.WAYPOINT, 53.36, -1.5),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())

    expect(traversal.points.map((point) => point.seq)).toEqual([
      0, 1, 2, 1, 2, 4, 1, 2, 4, 6,
    ])
    expect(traversal.totalDistance).toBe(
      round(walk(H, A, B, A, B, C, A, B, C, D)),
    )
    expectConsistent(traversal)
  })

  it("handles two jumps aimed at the same target", () => {
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
      item(3, CMD.DO_JUMP, null, null, { param1: 1, param2: 1 }),
      item(4, CMD.WAYPOINT, 53.4, -1.44),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())
    expect(traversal.points.map((point) => point.seq)).toEqual([0, 1, 1, 1, 4])
    expectConsistent(traversal)
  })

  it("stops and warns on a loop that cannot be exhausted", () => {
    // A jump whose count is large enough to run past the expansion limit
    const items = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.WAYPOINT, 53.4, -1.44),
      item(3, CMD.DO_JUMP, null, null, { param1: 1, param2: 100000 }),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home())

    expect(traversal.warnings).toContain(
      "Mission expansion reached safety limit. Graph may be truncated.",
    )
    expect(Number.isFinite(traversal.totalDistance)).toBe(true)
    expectConsistent(traversal)
  })

  it("expands a deep chain of jumps without hanging", () => {
    const items = [homeItem()]
    for (let seq = 1; seq <= 20; seq += 2) {
      items.push(item(seq, CMD.WAYPOINT, 53.38 + seq / 1000, -1.48))
      items.push(
        item(seq + 1, CMD.DO_JUMP, null, null, { param1: seq, param2: 2 }),
      )
    }

    const traversal = buildMissionTraversal(items, COPTER, home())
    expect(Number.isFinite(traversal.totalDistance)).toBe(true)
    expectConsistent(traversal)
  })
})

describe("randomised missions", () => {
  /* Deterministic PRNG, so a failure is reproducible from the seed. */
  function makeRandom(seed) {
    let state = seed
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
  }

  function randomMission(random) {
    const items = [homeItem()]
    const count = 3 + Math.floor(random() * 25)

    for (let seq = 1; seq <= count; seq++) {
      const roll = random()

      if (roll < 0.25 && seq > 1) {
        // A jump backwards to an earlier sequence number
        const target = 1 + Math.floor(random() * (seq - 1))
        const counts = [-1, 0, 1, 2, 3, 7]
        items.push(
          item(seq, CMD.DO_JUMP, null, null, {
            param1: target,
            param2: counts[Math.floor(random() * counts.length)],
          }),
        )
        continue
      }

      const lat = 53.3 + random() * 0.2
      const lon = -1.6 + random() * 0.3

      if (roll < 0.4) {
        items.push(
          item(seq, CMD.LOITER_TURNS, lat, lon, {
            param1: Math.floor(random() * 5) - 1,
            param3: Math.floor(random() * 200) - 50,
          }),
        )
        continue
      }

      if (roll < 0.5) {
        items.push(item(seq, CMD.DO_SET_ROI, lat, lon))
        continue
      }

      items.push(item(seq, CMD.WAYPOINT, lat, lon))
    }

    return items
  }

  it("stays consistent and terminates over 300 random missions", () => {
    const random = makeRandom(20260921)
    const startedAt = Date.now()

    for (let run = 0; run < 300; run++) {
      const items = randomMission(random)
      const traversal = buildMissionTraversal(items, COPTER, home())

      expectConsistent(traversal)
      expect(traversal.totalDistance).toBeGreaterThanOrEqual(0)

      // Re-derive the total from the points the graph is given: the legs
      // between them, plus a circle's worth for every loiter pass
      let rederived = 0
      let loiterPasses = 0
      for (let i = 1; i < traversal.points.length; i++) {
        const previous = traversal.points[i - 1]
        const point = traversal.points[i]

        if (point.isLoiterExit) {
          loiterPasses += 1
          rederived += point.cumulativeDistance - previous.cumulativeDistance
          continue
        }

        rederived += distance(
          [previous.lon, previous.lat],
          [point.lon, point.lat],
          { units: "meters" },
        )
      }

      // Each loiter arc is re-derived from two rounded cumulative values, so
      // it can be off by a hundredth of a metre
      expect(Math.abs(rederived - traversal.totalDistance)).toBeLessThan(
        0.05 + 0.01 * loiterPasses,
      )
    }

    expect(Date.now() - startedAt).toBeLessThan(20000)
  })
})

describe("mission ordering", () => {
  it("walks the mission in sequence order, not array order", () => {
    const ordered = [
      homeItem(),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
      item(2, CMD.WAYPOINT, 53.4, -1.44),
      item(3, CMD.WAYPOINT, 53.37, -1.42),
    ]
    const shuffled = [ordered[0], ordered[3], ordered[1], ordered[2]]

    expect(calculateMissionTotalDistance(shuffled, COPTER, home())).toBe(
      calculateMissionTotalDistance(ordered, COPTER, home()),
    )
  })
})

describe("altitudes", () => {
  it("resolves relative altitudes against home", () => {
    const items = [
      homeItem(HOME.lat, HOME.lon, 100),
      item(1, CMD.WAYPOINT, 53.39, -1.48),
    ]

    const traversal = buildMissionTraversal(items, COPTER, home(100))
    expect(traversal.points[1].altitude).toBe(150)
  })

  it("keeps absolute altitudes as they are", () => {
    const items = [
      homeItem(),
      { ...item(1, CMD.WAYPOINT, 53.39, -1.48), frame: GLOBAL, z: 220 },
    ]

    const traversal = buildMissionTraversal(items, COPTER, home(100))
    expect(traversal.points[1].altitude).toBe(220)
  })
})
