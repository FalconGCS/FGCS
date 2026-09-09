import "./css/index.css"
import "./css/resizable.css"

import "@mantine/code-highlight/styles.css"
import "@mantine/core/styles.css"
import "@mantine/notifications/styles.css"
import "@mantine/spotlight/styles.css"
import "@mantine/tiptap/styles.css"

import { MantineProvider } from "@mantine/core"
import React from "react"
import ReactDOM from "react-dom/client"
import { CustomMantineTheme } from "./components/customMantineTheme"
import ElevationGraphWindow from "./components/elevationGraphWindow/elevationGraphWindow"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={CustomMantineTheme}>
      <ElevationGraphWindow />
    </MantineProvider>
  </React.StrictMode>,
)

postMessage({ payload: "removeLoading" }, "*")
