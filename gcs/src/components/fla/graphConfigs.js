/*
  This file contains the different graph configs for the different types of log files opened with FLA.
  For example, a different log file can have a different x axis (time or linear), etc.
*/

// 3rd party imports
import moment from "moment"

// Styling imports
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config.js"

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

// Converts microseconds to a display time in the format mm:ss or mm:ss.SSS
// depending on the roundTo parameter
function microsecondsToDisplayTime(microseconds, roundTo) {
  const safeMicroseconds = Number.isFinite(microseconds) ? microseconds : 0
  const precision = Number.isInteger(roundTo)
    ? Math.max(0, Math.min(6, roundTo))
    : 0

  const wholeSeconds = Math.floor(safeMicroseconds / 1_000_000)
  const remainingMicros = safeMicroseconds - wholeSeconds * 1_000_000

  const fractionScale = 10 ** precision
  let roundedFraction = Math.round(
    (remainingMicros / 1_000_000) * fractionScale,
  )

  const secondCarry = Math.floor(roundedFraction / fractionScale)
  roundedFraction %= fractionScale

  const totalSeconds = wholeSeconds + secondCarry
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60

  if (precision === 0) {
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(roundedFraction).padStart(precision, "0")}`
}

function getChartLabel(context) {
  const label = context.dataset.label || ""
  const value = context.parsed.y
  const unit = context.dataset.yAxisID || ""
  // Round to 5 decimal places and remove trailing zeros
  const roundedValue = parseFloat(value.toFixed(5))
  // Don't display "UNKNOWN" as a unit
  const displayUnit = unit === "UNKNOWN" ? "" : unit
  return `${label}: ${roundedValue} ${displayUnit}`.trim()
}

const defaultOptions = {
  responsive: true,
  parsing: false,
  animation: false,
  maintainAspectRatio: false,
  plugins: {
    zoom: {
      pan: {
        enabled: true,
        mode: "xy",
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true,
        },
        drag: {
          enabled: true,
          modifierKey: "ctrl",
        },
        mode: "xy",
      },
    },
  },
  scales: {
    x: {
      type: "linear",
      grid: { color: tailwindColors.gray[600] },
    },
  },
  elements: {
    point: {
      radius: 0,
      hitRadius: 5,
    },
    line: {
      borderWidth: 1,
    },
  },
}

export const dataflashOptions = {
  ...defaultOptions,
  plugins: {
    ...defaultOptions.plugins,
    tooltip: {
      callbacks: {
        title: function (context) {
          return microsecondsToDisplayTime(context[0].parsed.x, 3)
        },
        label: getChartLabel,
      },
    },
  },
  scales: {
    ...defaultOptions.scales,
    x: {
      ...defaultOptions.scales.x,
      ticks: {
        callback: (label) => microsecondsToDisplayTime(label, 0),
        stepSize: 10_000_000,
      },
      title: {
        display: true,
        text: "Time since boot (mm:ss)",
      },
    },
  },
}

export const fgcsOptions = {
  ...defaultOptions,
  plugins: {
    ...defaultOptions.plugins,
    tooltip: {
      callbacks: {
        title: function (context) {
          return moment(context[0].parsed.x).format(
            "MMMM Do YYYY, HH:mm:ss.SSS",
          )
        },
        label: getChartLabel,
      },
    },
  },
  scales: {
    ...defaultOptions.scales,
    x: {
      ...defaultOptions.scales.x,
      type: "time",
      time: {
        // removed to fix issue #342
        // correct units are still displayed on the graph
        //unit: 'second',
        displayFormats: {
          second: "HH:mm:ss",
        },
      },
      ticks: {
        stepSize: 10,
      },
      title: {
        display: true,
        text: "Time",
      },
    },
  },
}
