/*
  Data Display. This is a collection of helpful functions to generate the styling for the numbers seen
  in the "Data" tab on the LH resizable section.
*/

// 3rd Party Imports
import { Tooltip } from "@mantine/core"

// Helper Functions
import { calcValueFontSize } from "./dashboardDataGrid"
import { dataFormatters } from "./dataFormatters"

const colorPalette = [
  "#36a2eb",
  "#ff6383",
  "#fe9e40",
  "#4ade80",
  "#ffcd57",
  "#4cbfc0",
  "#9966ff",
  "#c8cbce",
]

function to2dp(num) {
  // https://stackoverflow.com/questions/4187146/truncate-number-to-two-decimal-places-without-rounding
  return num.toString().match(/^-?\d+(?:\.\d{0,2})?/)[0]
}

export function DataMessage({
  label,
  value,
  currentlySelected,
  id,
  valueFontSize,
  labelFontSize,
  cellWidth,
}) {
  const isUnset =
    currentlySelected === null ||
    currentlySelected === undefined ||
    currentlySelected === ""

  let color = colorPalette[id % colorPalette.length]
  var formattedValue = "-"

  if (!isUnset) {
    formattedValue = to2dp(value)

    if (currentlySelected in dataFormatters) {
      formattedValue = to2dp(dataFormatters[currentlySelected](value))
    }
  }

  // Narrow this box's font to whatever it is actually showing
  const fittedValueFontSize = valueFontSize
    ? calcValueFontSize({
        cellWidth,
        maxFontSize: valueFontSize,
        text: formattedValue,
      })
    : undefined

  return (
    <Tooltip label={isUnset ? "No data selected" : currentlySelected}>
      <div className="flex flex-col items-center justify-center h-full overflow-hidden">
        <p
          className={`text-center truncate w-full font-bold ${labelFontSize ? "" : "text-sm"}`}
          style={labelFontSize ? { fontSize: `${labelFontSize}px` } : undefined}
        >
          {!isUnset && label}
        </p>
        <p
          className={`whitespace-nowrap ${fittedValueFontSize ? "" : "text-5xl"}`}
          style={{
            color: isUnset ? "#6b7280" : color,
            ...(fittedValueFontSize
              ? { fontSize: `${fittedValueFontSize}px`, lineHeight: 1.05 }
              : {}),
          }}
        >
          {formattedValue}
        </p>
      </div>
    </Tooltip>
  )
}
