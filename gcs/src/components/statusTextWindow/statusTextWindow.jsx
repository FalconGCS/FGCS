import { Stack } from "@mantine/core"
import { useEffect, useState } from "react"
import StatusMessages from "../dashboard/statusMessages"

export default function StatusTextWindow() {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    const onStatusText = (_event, nextMessages) => {
      setMessages(Array.isArray(nextMessages) ? nextMessages : [])
    }

    window.ipcRenderer.on("app:send-statustext", onStatusText)
    window.ipcRenderer.send("app:statustext-window:ready")

    return () => {
      window.ipcRenderer.removeListener("app:send-statustext", onStatusText)
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col">
      <Stack className="flex-1 overflow-hidden">
        <StatusMessages
          messages={messages}
          className="h-full lucent text-base"
        />
      </Stack>
    </div>
  )
}
