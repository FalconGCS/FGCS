/*
  Floating Status Text Messages widget (row-positioned like VideoWidget)
*/
import { ActionIcon, Text } from "@mantine/core"
import { IconExternalLink, IconResize } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"
import {
  selectOutsideVisibility,
  selectStatusTextSize,
  setStatusTextSize,
} from "../../redux/slices/droneConnectionSlice"
import { selectMessages } from "../../redux/slices/statusTextSlice"
import StatusMessages from "./statusMessages"

export default function StatusTextWidget() {
  const dispatch = useDispatch()
  const messages = useSelector(selectMessages)
  const statusTextSize = useSelector(selectStatusTextSize)
  const width = statusTextSize?.width ?? 600
  const height = statusTextSize?.height ?? 150
  const outsideVisibility = useSelector(selectOutsideVisibility)
  const backgroundColor = GetOutsideVisibilityColor()
  const [isPoppedOut, setIsPoppedOut] = useState(false)

  useEffect(() => {
    const onOpened = () => setIsPoppedOut(true)
    const onClosed = () => setIsPoppedOut(false)

    window.ipcRenderer.on("app:statustext-window-opened", onOpened)
    window.ipcRenderer.on("app:statustext-window-closed", onClosed)

    return () => {
      window.ipcRenderer.removeListener(
        "app:statustext-window-opened",
        onOpened,
      )
      window.ipcRenderer.removeListener(
        "app:statustext-window-closed",
        onClosed,
      )
    }
  }, [])

  function handlePopoutStatusText() {
    setIsPoppedOut(true)
    window.ipcRenderer.invoke("app:open-statustext-window")
  }

  function handleResizeStart(e) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = width
    const startHeight = height

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      // Top-left handle: dragging right/down shrinks, left/up expands.
      const newWidth = startWidth - deltaX
      const newHeight = startHeight - deltaY

      const clampedWidth = Math.max(320, Math.min(1600, newWidth))
      const clampedHeight = Math.max(120, Math.min(900, newHeight))

      dispatch(
        setStatusTextSize({
          width: clampedWidth,
          height: clampedHeight,
        }),
      )
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  if (isPoppedOut) {
    return null
  }

  return (
    <div
      className="rounded-md flex flex-col"
      style={{
        background: backgroundColor,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div className="p-2 h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <ActionIcon
              size="sm"
              variant="subtle"
              onMouseDown={handleResizeStart}
              className="text-slate-400 hover:text-slate-200 hover:cursor-ne-resize"
              title="Drag to resize"
            >
              <IconResize size={16} />
            </ActionIcon>
          </div>

          <Text>Messages</Text>

          <div className="flex items-center gap-1">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={handlePopoutStatusText}
              className="text-slate-400 hover:text-slate-200"
              title="Pop out status messages"
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <StatusMessages
            messages={messages}
            outsideVisibility={outsideVisibility}
            className={`h-full lucent text-base`}
          />
        </div>
      </div>
    </div>
  )
}
