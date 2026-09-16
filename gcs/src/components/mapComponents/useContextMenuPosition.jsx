import { useLayoutEffect, useState } from "react"

export default function useContextMenuPosition(menuRef, isOpen, clickPoint) {
  // Start at the click point, then correct once the menu has been measured
  const [position, setPosition] = useState(clickPoint)

  const clickX = clickPoint?.x ?? 0
  const clickY = clickPoint?.y ?? 0

  useLayoutEffect(() => {
    if (!isOpen || menuRef.current === null) return

    const menu = menuRef.current
    // The menu is positioned against this, so it is the box to stay inside
    const container = menu.offsetParent
    if (!container) return

    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // Flip to the other side of the cursor when there isn't room, then pull
    // back inside the map for a menu too large to fit on either side
    let x = clickX + menuWidth > containerWidth ? clickX - menuWidth : clickX
    let y = clickY + menuHeight > containerHeight ? clickY - menuHeight : clickY

    x = Math.max(0, Math.min(x, Math.max(0, containerWidth - menuWidth)))
    y = Math.max(0, Math.min(y, Math.max(0, containerHeight - menuHeight)))

    setPosition((currentPosition) =>
      currentPosition.x === x && currentPosition.y === y
        ? currentPosition
        : { x, y },
    )
  })

  return isOpen ? position : clickPoint
}
