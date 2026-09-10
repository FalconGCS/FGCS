const metadataModules = import.meta.glob(
  "../../data/gen_mav_cmd_param_meta.json",
  { eager: true },
)

const COMMAND_PARAM_META = Object.values(metadataModules)[0]?.default ?? {}

const MIN_PARAM_INDEX = 1
const MAX_PARAM_INDEX = 7

export function getMissionCommandMeta(command) {
  const entry = COMMAND_PARAM_META[String(command)]
  if (entry === undefined) return null

  return { name: entry.name, description: entry.description }
}

export function getMissionCommandParamMeta(command, paramIndex) {
  if (paramIndex < MIN_PARAM_INDEX || paramIndex > MAX_PARAM_INDEX) return null

  const entry = COMMAND_PARAM_META[String(command)]
  return entry?.params?.[String(paramIndex)] ?? null
}

export function getMissionCommandParamTooltip(command, paramIndex) {
  const meta = getMissionCommandParamMeta(command, paramIndex)
  if (meta === null) return null

  const description =
    meta.description.toLowerCase() === "empty" ? "" : meta.description

  if (!meta.label) {
    if (!description) return null

    return { title: `Param ${paramIndex}`, description }
  }

  return {
    title: meta.units ? `${meta.label} (${meta.units})` : meta.label,
    description,
  }
}
