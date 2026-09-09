/*
  Generic error boundary prop that handles errors and shows the fallback prop.
*/

// Local Imports
import { useMemo, useState } from "react"
import packageJson from "../../../package.json"

// 3rd Party Imports
import { CodeHighlight } from "@mantine/code-highlight"
import { Button } from "@mantine/core"
import { useStore } from "react-redux"

function getAircraftTypeLabel(aircraftType) {
  if (aircraftType === 1) {
    return "Plane"
  }

  if (aircraftType === 2) {
    return "Copter"
  }

  return "Unknown"
}

export default function ErrorBoundaryFallback({ error, resetErrorBoundary }) {
  const [showDiagnostics, setShowDiagnostics] = useState(true)
  const [showStack, setShowStack] = useState(false)
  const store = useStore()

  const diagnostics = useMemo(() => {
    const state = store?.getState?.() || {}
    const connection = state.droneConnection || {}
    const droneInfo = state.droneInfo || {}
    const statusText = state.statustext || {}
    const runtimePlatform = navigator.userAgentData?.platform || "unknown"

    const connectionSummary = {
      connected: !!connection.connected,
      connecting: !!connection.connecting,
      connectedToSimulator: !!connection.connected_to_simulator,
      connectionType: connection.connection_type || "unknown",
      serial: {
        selectedPort: connection.selected_com_ports || "unknown",
        baudrate: connection.baudrate || "unknown",
      },
      network: {
        protocol: connection.network_type || "unknown",
        ip: connection.ip || "unknown",
        port: connection.port || "unknown",
      },
      forwarding: {
        enabled: !!connection.isForwarding,
        address: connection.forwardingAddress || "",
      },
    }

    return {
      generatedAt: new Date().toISOString(),
      app: {
        name: packageJson.productName || packageJson.name,
        version: packageJson.version,
        environment: import.meta.env.MODE,
        route: window.location.hash,
      },
      runtime: {
        platform: runtimePlatform,
        language: navigator.language,
        userAgent: navigator.userAgent,
      },
      drone: {
        aircraftType: getAircraftTypeLabel(droneInfo.aircraftType),
        firmwareVersion: droneInfo.flightSwVersion || "unknown",
        armed: !!droneInfo.isArmed,
        flying: !!droneInfo.isFlying,
      },
      connection: connectionSummary,
      recentStatusText: Array.isArray(statusText.messages)
        ? statusText.messages.slice(0, 10)
        : [],
      error: {
        name: error?.name || "Error",
        message: error?.message || "Unknown error",
      },
    }
  }, [error, store])

  const diagnosticsText = useMemo(
    () => JSON.stringify(diagnostics, null, 2),
    [diagnostics],
  )

  const stackText = error?.stack || "No stack trace available"

  return (
    <div className="flex flex-col w-full h-full items-center justify-center text-center text-xl gap-y-2">
      <h1 className="font-bold text-4xl text-falconred-700">
        We hit an unexpected error
      </h1>

      <div className="w-full max-w-4xl px-4">
        <p>
          Please report this{" "}
          <a
            href="https://github.com/Avis-Drone-Labs/FGCS/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=%5BBUG%5D"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-falconred-700"
          >
            here
          </a>{" "}
          so we can fix it quickly.
        </p>
        <p className="mt-2 text-base text-falcongrey-200">
          This panel includes useful debugging information that can be pasted
          into a bug report.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <Button
            size="sm"
            variant="light"
            color="blue"
            onClick={() => setShowDiagnostics((prev) => !prev)}
          >
            {showDiagnostics ? "Hide diagnostics" : "Show diagnostics"}
          </Button>
          <Button
            size="sm"
            variant="light"
            color="grape"
            onClick={() => setShowStack((prev) => !prev)}
          >
            {showStack ? "Hide stack trace" : "Show stack trace"}
          </Button>
        </div>

        {showDiagnostics && (
          <div className="mt-4 max-h-[32vh] overflow-y-auto rounded-lg">
            <CodeHighlight
              className="!px-4 !py-2 !bg-falcongrey-900 !rounded-lg !text-left"
              language="json"
              copyLabel="Copy diagnostics"
              copiedLabel="Copied!"
              code={diagnosticsText}
            />
          </div>
        )}

        {showStack && (
          <div className="mt-4 max-h-[32vh] overflow-y-auto rounded-lg">
            <CodeHighlight
              block
              className="!px-4 !py-2 !bg-falcongrey-900 !rounded-lg !text-left"
              language="js"
              copyLabel="Copy stack trace"
              copiedLabel="Copied!"
              code={stackText}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Button
          size="md"
          variant="light"
          color="red"
          onClick={() => window.ipcRenderer.send("window:force-reload")}
        >
          Reload app
        </Button>
        <Button
          size="md"
          variant="outline"
          color="gray"
          onClick={resetErrorBoundary}
        >
          Retry render
        </Button>
      </div>
    </div>
  )
}
