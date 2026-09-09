import { useEffect, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import manifest from "../../data/gen_apm_params_versions.json"
import {
  selectAircraftType,
  selectFlightSwVersion,
} from "../redux/slices/droneInfoSlice"

const paramDefinitionModules = import.meta.glob(
  "../../data/gen_apm_params_def_*_*.json",
)

const modulePathByFileName = Object.fromEntries(
  Object.keys(paramDefinitionModules).map((path) => [
    path.split("/").pop(),
    path,
  ]),
)

function getAircraftKey(aircraftType) {
  if (aircraftType === 1) {
    return "plane"
  }

  if (aircraftType === 2) {
    return "copter"
  }

  return null
}

export function parseMajorMinorVersion(versionString) {
  const match = String(versionString || "").match(/(\d+)\.(\d+)/)
  if (!match) {
    return null
  }

  return `${match[1]}.${match[2]}`
}

function getAvailableVersions(aircraftKey) {
  if (!aircraftKey) {
    return []
  }

  const versions = manifest?.vehicles?.[aircraftKey]?.versions
  return Array.isArray(versions) ? versions : []
}

function getLatestVersion(aircraftKey) {
  if (!aircraftKey) {
    return null
  }

  return manifest?.vehicles?.[aircraftKey]?.latest || null
}

function getResolvedVersion(aircraftKey, requestedVersion) {
  const versions = getAvailableVersions(aircraftKey)
  if (versions.length === 0) {
    return null
  }

  if (requestedVersion && versions.includes(requestedVersion)) {
    return requestedVersion
  }

  return getLatestVersion(aircraftKey) || versions[versions.length - 1]
}

function getManifestFileName(aircraftKey, version) {
  if (!aircraftKey || !version) {
    return null
  }

  return manifest?.vehicles?.[aircraftKey]?.files?.[version] || null
}

function findModulePath(aircraftKey, version) {
  const manifestFileName = getManifestFileName(aircraftKey, version)
  if (!manifestFileName) {
    return null
  }

  return modulePathByFileName[manifestFileName] || null
}

export function resolveParamDefinitionVersion(aircraftKey, versionString) {
  const requestedVersion = parseMajorMinorVersion(versionString)
  const resolvedVersion = getResolvedVersion(aircraftKey, requestedVersion)

  return {
    requestedVersion,
    resolvedVersion,
  }
}

export async function loadParamDefinitionsForVersion(
  aircraftKey,
  versionString,
) {
  const { requestedVersion, resolvedVersion } = resolveParamDefinitionVersion(
    aircraftKey,
    versionString,
  )

  const modulePath = findModulePath(aircraftKey, resolvedVersion)
  if (!modulePath) {
    return {
      paramDefs: {},
      requestedVersion,
      resolvedVersion,
    }
  }

  const loadedModule = await paramDefinitionModules[modulePath]()

  return {
    paramDefs: loadedModule.default || {},
    requestedVersion,
    resolvedVersion,
  }
}

export function useParamDefinitions() {
  const aircraftType = useSelector(selectAircraftType)
  const flightSwVersion = useSelector(selectFlightSwVersion)
  const [paramDefs, setParamDefs] = useState({})

  const aircraftKey = useMemo(
    () => getAircraftKey(aircraftType),
    [aircraftType],
  )

  const { requestedVersion, resolvedVersion } = useMemo(
    () => resolveParamDefinitionVersion(aircraftKey, flightSwVersion),
    [aircraftKey, flightSwVersion],
  )

  useEffect(() => {
    let cancelled = false

    loadParamDefinitionsForVersion(aircraftKey, flightSwVersion).then(
      (result) => {
        if (!cancelled) {
          setParamDefs(result.paramDefs)
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [aircraftKey, flightSwVersion])

  return {
    paramDefs,
    aircraftKey,
    requestedVersion,
    resolvedVersion,
  }
}
