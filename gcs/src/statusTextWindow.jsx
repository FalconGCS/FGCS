import "./css/index.css" // Needs to be at the top of the file
import "./css/resizable.css"

// Style imports
import "@mantine/code-highlight/styles.css"
import "@mantine/core/styles.css"
import "@mantine/notifications/styles.css"
import "@mantine/spotlight/styles.css"
import "@mantine/tiptap/styles.css"

import { MantineProvider } from "@mantine/core"
import React from "react"
import ReactDOM from "react-dom/client"
import { CustomMantineTheme } from "./components/customMantineTheme"
import StatusTextWindow from "./components/statusTextWindow/statusTextWindow"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={CustomMantineTheme}>
      <StatusTextWindow />
    </MantineProvider>
  </React.StrictMode>,
)

postMessage({ payload: "removeLoading" }, "*")
