import { Alert } from "@mantine/core"
import { IconAlertTriangle } from "@tabler/icons-react"
import { useMemo } from "react"
import { SeverityColor } from "./alertConstants"
import { useAlerts } from "./alertContext"

export default function AlertSection() {
  const { alerts, dismissAlert } = useAlerts()

  const sortedAlerts = useMemo(() => {
    return alerts.toSorted((a1, a2) => a2.severity - a1.severity)
  }, [alerts])

  return (
    <div className="space-y-2 max-w-sm">
      {sortedAlerts.map((alert) => (
        <div
          className="bg-falcongrey-900/90"
          key={alert.category}
          style={{ borderRadius: "var(--mantine-radius-default)" }}
        >
          <Alert
            variant="outline"
            color={SeverityColor[alert.severity]}
            withCloseButton={alert.dismissable !== false}
            title={alert.category}
            icon={<IconAlertTriangle />}
            onClose={
              alert.dismissable === false
                ? undefined
                : () => dismissAlert(alert.category, true)
            }
          >
            {alert.jsx}
          </Alert>
        </div>
      ))}
    </div>
  )
}
