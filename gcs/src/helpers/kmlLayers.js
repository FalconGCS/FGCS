import { useCallback, useEffect } from "react"
import { useDispatch } from "react-redux"

import {
  addKmlLayers,
  setKmlLayers,
  setKmlLoading,
} from "../redux/slices/kmlSlice"
import { getPersistedKmlPresentation, parseKmlToLayer } from "./kml"
import {
  closeLoadingNotification,
  redColor,
  showErrorNotification,
  showLoadingNotification,
} from "./notification"

async function parseKmlFiles(files) {
  const presentation = getPersistedKmlPresentation()
  const layers = []
  const errors = []

  for (const file of files) {
    try {
      const layer = parseKmlToLayer(file)
      layers.push({ ...layer, ...presentation[layer.id] })
    } catch (error) {
      errors.push({ name: file.name, error: error.message })
      try {
        await window.ipcRenderer.invoke("kml:delete", file.id)
      } catch {
        console.log("IPC Call Failed: kml:delete")
      }
    }
  }

  return { layers, errors }
}

export function useLoadStoredKmlLayers() {
  const dispatch = useDispatch()

  useEffect(() => {
    async function loadStoredKmlLayers() {
      dispatch(setKmlLoading(true))

      try {
        const result = await window.ipcRenderer.invoke("kml:list")
        if (!result.success) {
          showErrorNotification(`Failed to load KML files: ${result.error}`)
          return
        }

        const { layers, errors } = await parseKmlFiles(result.layers)
        dispatch(setKmlLayers(layers))
        errors.forEach(({ name, error }) =>
          showErrorNotification(`Could not load ${name}: ${error}`),
        )
      } catch {
        console.log("IPC Call Failed: kml:list")
      } finally {
        dispatch(setKmlLoading(false))
      }
    }

    loadStoredKmlLayers()
  }, [])
}

export function useImportKmlLayers() {
  const dispatch = useDispatch()

  return useCallback(async () => {
    let result
    try {
      result = await window.ipcRenderer.invoke("kml:import")
    } catch {
      console.log("IPC Call Failed: kml:import")
      return
    }

    if (!result.success && !result.layers?.length) {
      // Nothing was read, either the dialog was cancelled or every file failed
      result.errors?.forEach(({ name, error }) =>
        showErrorNotification(`Could not import ${name}: ${error}`),
      )
      return
    }

    const notificationId = showLoadingNotification(
      "Loading KML",
      "Parsing files...",
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    const { layers, errors } = await parseKmlFiles(result.layers)

    if (layers.length === 0) {
      closeLoadingNotification(
        notificationId,
        "No KML loaded",
        "None of the selected files could be read",
        { color: redColor },
      )
    } else {
      dispatch(addKmlLayers(layers))
      closeLoadingNotification(
        notificationId,
        "KML loaded",
        `Added ${layers.length} file${layers.length === 1 ? "" : "s"} to the map`,
      )
    }

    ;[...(result.errors ?? []), ...errors].forEach(({ name, error }) =>
      showErrorNotification(`Could not import ${name}: ${error}`),
    )
  }, [dispatch])
}
