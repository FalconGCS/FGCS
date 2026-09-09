/*
  Custom component for dashboard
  Displays messages with different severity
*/

// Base imports
import moment from "moment"
import { useEffect, useRef, useState } from "react"

// Third party imports
import { ScrollArea } from "@mantine/core"

export default function StatusMessages(props) {
  const viewport = useRef(null)
  const outsideVisibility = props.outsideVisibility ?? false
  const [scrollPosition, onScrollPositionChange] = useState({ x: 0, y: 0 })

  // Scroll to top when new message arrives
  useEffect(() => {
    if (scrollPosition.y < 100) {
      viewport.current?.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [props.messages])

  function getSeverityClassNames(severity) {
    switch (severity) {
      case 0:
        return "font-bold text-falconred"
      case 1:
        return "text-red-500"
      case 2:
        return "text-red-400"
      case 3:
        return "text-orange-500"
      case 4:
        return "text-amber-500"
      case 5:
        return "text-amber-300"
      case 7:
        return "text-gray-400"
      default:
        return ""
    }
  }

  function getMessageOutsideVisibilityClassNames() {
    let base = "flex flex-row space-x-2"
    return `${base} ${outsideVisibility ? "font-bold !text-2xl" : ""}`
  }

  return (
    <div className={props.className}>
      <ScrollArea
        className="h-full w-full"
        viewportRef={viewport}
        onScrollPositionChange={onScrollPositionChange}
      >
        {props.messages.map((message, index) => {
          return (
            <div
              key={index}
              className={getMessageOutsideVisibilityClassNames()}
            >
              {message.timestamp !== null && (
                <p className="text-gray-400">
                  {moment.unix(message.timestamp).format("HH:mm:ss")}
                </p>
              )}
              <p className={getSeverityClassNames(message.severity)}>
                {message.text}
              </p>
            </div>
          )
        })}
      </ScrollArea>
    </div>
  )
}
