import { useLayoutEffect, useState } from "react"

const BOTTOM_RESERVE_PX = 24

export default function useAvailableGridHeight(gridRef) {
  const [availableHeight, setAvailableHeight] = useState(0)

  useLayoutEffect(() => {
    const grid = gridRef.current
    const container = grid?.closest("[data-telemetry-panel]")
    if (!grid || !container) return

    function measure() {
      // Hidden tab panels measure as zero
      if (container.clientHeight === 0 || grid.offsetParent === null) return

      // Everything above the grid
      const offsetTop =
        grid.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop

      const next = Math.max(
        0,
        Math.round(container.clientHeight - offsetTop - BOTTOM_RESERVE_PX),
      )

      setAvailableHeight((current) => (current === next ? current : next))
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    Array.from(container.children).forEach((child) => {
      if (!child.contains(grid)) observer.observe(child)
    })

    return () => observer.disconnect()
  }, [gridRef])

  return availableHeight
}
