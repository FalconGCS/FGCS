/* Alert
 * {
 *     category: AlertCategory,
 *     severity: AlertSeverity,
 *     jsx: <></>
 * }
 */

import { useRef, useState } from "react"
import { AlertContext } from "./alertContext"

export default function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([])
  const dismissedAlerts = useRef(new Map())

  function dispatchAlert(alert) {
    if (dismissedAlerts.current.get(alert.category) >= alert.severity) return
    dismissedAlerts.current.delete(alert.category)

    const existingAlertIndex = alerts.findIndex(
      (existingAlert) => existingAlert.category == alert.category,
    )
    if (existingAlertIndex >= 0) {
      alerts[existingAlertIndex] = alert
      setAlerts([...alerts])
    } else {
      setAlerts([...alerts, alert])
    }
  }

  function dismissAlert(category, manual) {
    setAlerts((prevAlerts) => {
      const alert = prevAlerts.find((a) => a.category === category)
      if (!alert) return prevAlerts

      if (manual && alert.dismissable === false) {
        return prevAlerts
      }

      if (manual) {
        dismissedAlerts.current.set(category, alert.severity)
      } else {
        dismissedAlerts.current.delete(category)
      }

      return prevAlerts.filter((a) => a.category !== category)
    })
  }

  return (
    <AlertContext.Provider value={{ alerts, dispatchAlert, dismissAlert }}>
      {children}
    </AlertContext.Provider>
  )
}
