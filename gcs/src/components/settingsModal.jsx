import {
  Button,
  Checkbox,
  Group,
  Input,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core"
import { useSettings } from "../helpers/settings"

import { ActionIcon, Tooltip } from "@mantine/core"
import { useDebouncedValue, useDisclosure } from "@mantine/hooks"
import {
  IconAlertCircle,
  IconCheck,
  IconRestore,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react"
import { Octokit } from "octokit"
import { memo, useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import semverGt from "semver/functions/gt"
import DefaultSettings from "../../data/default_settings.json"
import { DATA_STREAM_MAP } from "../helpers/mavlinkConstants"
import {
  closeLoadingNotification,
  redColor,
  showLoadingNotification,
} from "../helpers/notification"
import { emitSetStreamRates } from "../redux/slices/droneConnectionSlice"

const octokit = new Octokit({})

const isValidNumber = (num, range) => {
  return (
    num &&
    parseInt(num) &&
    (range === null || (range[0] <= num && num <= range[1]))
  )
}

function TextSetting({ settingName, hidden, matches }) {
  const { getSetting, setSetting } = useSettings()
  const settingValue = getSetting(settingName)

  const [newValue, setNewValue] = useState(settingValue)

  // Debounce the value to prevent excessive updates
  const [debounced] = useDebouncedValue(newValue, 500)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (settingValue !== newValue) {
      setNewValue(settingValue)
    }
  }, [settingValue])

  useEffect(() => {
    if (debounced === settingValue) return

    if (matches) {
      const regex = new RegExp(matches)
      if (!regex.test(debounced)) {
        setError("Invalid input format")
        return
      } else {
        setError(null)
      }
    }

    setSetting(settingName, debounced)
  }, [debounced])

  return (
    <TextInput
      value={newValue ?? ""}
      onChange={(e) => setNewValue(e.currentTarget.value)}
      type={hidden ? "password" : "text"}
      error={error}
    />
  )
}

function BoolSetting({ settingName }) {
  const { getSetting, setSetting } = useSettings()
  return (
    <Checkbox
      checked={getSetting(settingName)}
      onChange={(e) => setSetting(settingName, e.currentTarget.checked)}
    />
  )
}

function ReleaseCheckRow() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  const checkNow = async () => {
    setChecking(true)
    setResult(null)
    try {
      // Allow manual check in dev and production
      const currentVersion = await window.ipcRenderer.invoke("app:get-version")

      const releasesResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/releases",
        {
          owner: "Avis-Drone-Labs",
          repo: "fgcs",
          headers: { "X-GitHub-Api-Version": "2022-11-28" },
        },
      )

      if (releasesResponse.status !== 200) {
        setResult({ error: "Failed to fetch releases" })
        return
      }

      const releases = Array.isArray(releasesResponse.data)
        ? [...releasesResponse.data]
        : []

      if (releases.length === 0) {
        setResult({ found: false })
        return
      }

      // Filter out draft or unpublished releases
      const publishedReleases = releases.filter(
        (release) => !release.draft && release.published_at,
      )

      if (publishedReleases.length === 0) {
        setResult({ found: false })
        return
      }

      // Choose the most recent prerelease or release by published_at
      publishedReleases.sort(
        (a, b) => new Date(b.published_at) - new Date(a.published_at),
      )
      const latest = publishedReleases[0]
      const latestTag = latest.tag_name

      const isNewer = semverGt(latestTag, currentVersion)
      setResult({ found: true, latestTag, url: latest.html_url, isNewer })
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="px-10 flex items-center gap-4">
      <div className="flex-1">
        <div className="text-sm">Pre-release check</div>
        <div className="text-xs text-gray-400">
          Manually check for pre-release versions on GitHub
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="xs" color="blue" onClick={checkNow} loading={checking}>
          Check now
        </Button>
        {result && result.error && (
          <div className="text-xs text-red-400">Error: {result.error}</div>
        )}
        {result && !result.error && !result.found && (
          <div className="text-xs text-gray-400">No pre-releases found</div>
        )}
        {result && result.found && (
          <div className="text-xs">
            Latest:{" "}
            <a
              className="text-blue-400 underline"
              href={result.url}
              target="_blank"
              rel="noreferrer"
            >
              {result.latestTag}
            </a>
            {result.isNewer ? (
              <span className="text-green-400 pl-2">
                (Newer than installed)
              </span>
            ) : (
              <span className="text-gray-400 pl-2">(Not newer)</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SetRatesRow() {
  const { getSetting } = useSettings()
  const dispatch = useDispatch()
  const developerDefaults = DefaultSettings?.Developer ?? {}

  const onClick = () => {
    for (const [name, value] of Object.entries(DATA_STREAM_MAP)) {
      if (!Object.hasOwn(developerDefaults, name)) continue

      const rateSetting = getSetting(`Developer.${name}`)
      const rate = Number(rateSetting)
      if (!Number.isFinite(rate)) continue
      if (rate < 0 || rate > 15) continue
      dispatch(emitSetStreamRates({ stream: value, rate: rate }))
    }
  }

  return (
    <div className="mt-0! px-10">
      <p className="text-xs text-gray-400 mb-2">
        Note: Data stream rates here apply to the dashboard only.
      </p>
      <div className="flex justify-end">
        <Button size="compact-xs" color="blue" onClick={onClick}>
          Set rates
        </Button>
      </div>
    </div>
  )
}

function OptionSetting({ settingName, options }) {
  const { getSetting, setSetting } = useSettings()
  return (
    <Select
      data={options}
      value={getSetting(settingName)}
      onChange={(value) => setSetting(settingName, value)}
    />
  )
}

function NumberSetting({ settingName, range }) {
  const { getSetting, setSetting } = useSettings()

  return (
    <Input
      value={getSetting(settingName)}
      onChange={(e) => {
        const num = e.currentTarget.value
        if (isValidNumber(num, range)) setSetting(settingName, Number(num))
      }}
    />
  )
}

const generateId = () => Math.random().toString(36).slice(8)

function ExtendableNumberSetting({ settingName, range, suffix }) {
  const { getSetting, setSetting } = useSettings()
  const settingValue = getSetting(settingName)

  const [values, setValues] = useState(() =>
    settingValue.map((val) => ({ id: generateId(), value: val })),
  )

  useEffect(() => {
    const currentValues = values.map((v) => v.value)
    if (JSON.stringify(settingValue) !== JSON.stringify(currentValues)) {
      setValues((prev) =>
        settingValue.map((val, i) => ({
          id: prev[i]?.id ?? generateId(),
          value: val,
        })),
      )
    }
  }, [settingValue])

  useEffect(() => {
    const newArray = values.map((a) => a.value)
    if (JSON.stringify(settingValue) !== JSON.stringify(newArray)) {
      setSetting(settingName, newArray)
    }
  }, [values])

  const updateValue = (id, value) => {
    setValues((prev) => prev.map((a) => (a.id === id ? { ...a, value } : a)))
  }

  const removeValue = (id) => {
    setValues((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="flex flex-col shrink-0 items-end gap-2">
      {values.map(({ id, value }) => (
        <div key={id} className="flex gap-2 items-center">
          <button
            className="text-falconred-600 hover:text-falconred-700 p-1 rounded-full"
            onClick={() => removeValue(id)}
          >
            <IconTrash size={20} />
          </button>
          <NumberInput
            value={value}
            min={range ? range[0] : null}
            max={range ? range[1] : null}
            onChange={(num) => {
              if (!isValidNumber(num, range)) return
              updateValue(id, parseInt(num))
            }}
            suffix={suffix}
          />
        </div>
      ))}
      <div className="w-full pl-9">
        <Button
          fullWidth
          onClick={() => setValues([...values, { id: generateId(), value: 0 }])}
        >
          Add new Alert
        </Button>
      </div>
    </div>
  )
}

function ExtendableTextSetting({ settingName, df }) {
  const { getSetting, setSetting } = useSettings()

  const [items, setItems] = useState(
    getSetting(settingName).length > 0
      ? getSetting(settingName).map((item) => {
          const newItem = { id: generateId() }
          df.fields.forEach((field) => {
            newItem[field.key] = item[field.key] || ""
          })
          return newItem
        })
      : [],
  )

  useEffect(() => {
    const cleanItems = items.map((item) => {
      const cleanItem = {}
      df.fields.forEach((field) => {
        cleanItem[field.key] = item[field.key]
      })
      return cleanItem
    })

    // Check for change and if so, set.
    const currentSetting = getSetting(settingName)
    if (JSON.stringify(currentSetting) !== JSON.stringify(cleanItems)) {
      setSetting(settingName, cleanItems)
    }
  }, [items, settingName, setSetting, df.fields])

  const updateItemField = (id, fieldKey, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [fieldKey]: value } : item,
      ),
    )
  }

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const validateField = (field, value) => {
    if (!field.validation) return { isValid: true, error: null }
    if (!value) return { isValid: false, error: "Invalid input" }

    switch (field.validation) {
      case "rtsp":
        try {
          const parsedUrl = new URL(value)
          const isValid = parsedUrl.protocol === "rtsp:"
          return {
            isValid,
            error: isValid ? null : "Invalid RTSP URL",
          }
        } catch {
          return { isValid: false, error: "Invalid RTSP URL" }
        }
      default:
        return { isValid: true, error: null }
    }
  }

  const addNewItem = () => {
    const newItem = { id: generateId() }
    df.fields.forEach((field) => {
      newItem[field.key] = ""
    })
    setItems([...items, newItem])
  }

  return (
    <div className="flex flex-col shrink-0 items-end gap-3">
      {items.map((item) => (
        <div key={item.id} className="flex gap-2 items-start">
          <button
            className="text-falconred-600 hover:text-falconred-700 p-1 rounded-full mt-1"
            onClick={() => removeItem(item.id)}
            title={`Remove ${df.display.toLowerCase().slice(0, -1)}`}
          >
            <IconTrash size={20} />
          </button>
          <div className="flex flex-col gap-1 min-w-80">
            {df.fields.map((field) => {
              const validation = validateField(field, item[field.key])
              return (
                <TextInput
                  key={field.key}
                  placeholder={field.placeholder}
                  value={item[field.key]}
                  onChange={(e) =>
                    updateItemField(item.id, field.key, e.currentTarget.value)
                  }
                  size="sm"
                  label={field.label}
                  error={validation.error}
                />
              )
            })}
          </div>
        </div>
      ))}
      <div className="w-full pl-9">
        <Button fullWidth onClick={addNewItem} size="sm">
          Add {df.display.slice(0, -1)}
        </Button>
      </div>
    </div>
  )
}

function FFmpegBinarySetting({ settingName }) {
  const { getSetting, setSetting } = useSettings()
  const [binaryInfo, setBinaryInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load binary info on component mount
  useEffect(() => {
    loadBinaryInfo()
  }, [])

  const loadBinaryInfo = async () => {
    try {
      const info = await window.ipcRenderer.invoke("ffmpeg:get-binary-info")
      setBinaryInfo(info)

      // Update the setting with the current path
      if (info.exists && info.path !== getSetting(settingName)) {
        setSetting(settingName, info.path)
      }
    } catch (error) {
      console.error("Failed to load FFmpeg binary info:", error)
    }
  }

  const handleDownload = async () => {
    const loadingNotificationId = showLoadingNotification(
      "Info",
      "Downloading FFmpeg binary...",
    )
    setIsLoading(true)

    try {
      const result = await window.ipcRenderer.invoke("ffmpeg:download-binary")

      if (result.success) {
        closeLoadingNotification(
          loadingNotificationId,
          "Success",
          "FFmpeg binary downloaded successfully!",
        )
        setSetting(settingName, result.path)
        await loadBinaryInfo()
      } else {
        closeLoadingNotification(
          loadingNotificationId,
          "Error",
          `Download failed: ${result.error}`,
          { color: redColor },
        )
      }
    } catch (error) {
      closeLoadingNotification(
        loadingNotificationId,
        "Error",
        `Download failed: ${error.message}`,
        { color: redColor },
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    const loadingNotificationId = showLoadingNotification(
      "Info",
      "Removing FFmpeg binary...",
    )
    setIsLoading(true)

    try {
      const result = await window.ipcRenderer.invoke("ffmpeg:delete-binary")

      if (result.success) {
        closeLoadingNotification(
          loadingNotificationId,
          "Success",
          "Binary removed successfully!",
        )
        setSetting(settingName, "")
        await loadBinaryInfo()
      } else {
        closeLoadingNotification(
          loadingNotificationId,
          "Error",
          "Failed to remove binary",
          { color: redColor },
        )
      }
    } catch (error) {
      closeLoadingNotification(
        loadingNotificationId,
        "Error",
        `Failed to remove binary: ${error.message}`,
        { color: redColor },
      )
    } finally {
      setIsLoading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown size"
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="px-10">
      {binaryInfo?.exists ? (
        <div className="bg-green-900/20 border border-green-700 rounded p-3">
          <div className="flex flex-row items-center gap-2 mb-2">
            <IconCheck size={16} className="text-green-400" />
            <p>FFmpeg binary is installed</p>
            <br />
          </div>
          <p className="text-xs text-slate-400 mb-2">Path: {binaryInfo.path}</p>
          <p className="text-xs text-slate-400 mb-2">
            Size: {formatFileSize(binaryInfo.size)}
          </p>
          <Button
            size="compact-xs"
            color="red"
            onClick={handleDelete}
            loading={isLoading}
          >
            Remove Binary
          </Button>
        </div>
      ) : (
        <div className="bg-orange-900/20 border border-orange-700 rounded p-3">
          <div className="mb-2 flex items-center gap-2">
            <IconAlertCircle size={16} className="text-orange-400" />
            <p>FFmpeg binary not found</p>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            Download FFmpeg to enable RTSP stream conversion
          </p>
          <Button
            size="xs"
            color="blue"
            onClick={handleDownload}
            loading={isLoading}
          >
            Download FFmpeg
          </Button>
        </div>
      )}
    </div>
  )
}

function Setting({ settingName, df, initialValue }) {
  const { getSetting, setSetting } = useSettings()
  const [changed, setChanged] = useState(false)
  const [changedFromDefault, setChangedFromDefault] = useState(false)

  useEffect(() => {
    if (initialValue !== undefined)
      setChanged(
        JSON.stringify(getSetting(settingName)) != JSON.stringify(initialValue),
      )

    setChangedFromDefault(
      !["[]", '""'].includes(JSON.stringify(df.default)) &&
        JSON.stringify(getSetting(settingName)) != JSON.stringify(df.default),
    )
  }, [getSetting(settingName)])

  const resetToDefault = () => setSetting(settingName, df.default)

  // Special handling for FFmpeg binary settings
  if (settingName === "Video.ffmpegBinaryPath") {
    return <FFmpegBinarySetting settingName={settingName} />
  }

  // Skip the download status setting as it's managed internally
  if (settingName === "Video.ffmpegDownloadStatus") {
    return null
  }

  return (
    <div
      className={`flex flex-row gap-8 justify-between ${df.type != "extendableNumber" && df.type != "extendableText" && "items-center"} px-10 `}
    >
      <div className="relative">
        {changedFromDefault && (
          <div className="absolute right-full pr-2">
            <Tooltip label="Reset to default">
              <ActionIcon
                variant="transparent"
                color="gray"
                size="sm"
                onClick={resetToDefault}
              >
                <IconRestore size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
        <div>{df.display}:</div>
        <p className="text-gray-400 text-sm">{df.description}</p>
        {df.requireRestart && (
          <p
            className={`${changed ? "text-falconred" : "text-gray-600"} text-xs`}
          >
            (requires restart)
          </p>
        )}
      </div>
      {df.type == "extendableNumber" ? (
        <ExtendableNumberSetting
          settingName={settingName}
          range={df.range || null}
          suffix={df.suffix}
        />
      ) : df.type == "extendableText" ? (
        <ExtendableTextSetting settingName={settingName} df={df} />
      ) : df.type == "number" ? (
        <NumberSetting settingName={settingName} range={df.range || null} />
      ) : df.type == "boolean" ? (
        <BoolSetting settingName={settingName} options={df.options} />
      ) : df.type == "option" ? (
        <OptionSetting settingName={settingName} options={df.options} />
      ) : (
        <TextSetting
          settingName={settingName}
          hidden={df.hidden || false}
          matches={df.matches}
        />
      )}
    </div>
  )
}

function SettingsModal() {
  const settingTabs = Object.keys(DefaultSettings)

  const { getSetting, opened, close } = useSettings()
  const [initialSettings, setInitialSettings] = useState({})

  const [
    confirmRestartOpened,
    { open: confirmRestartOpen, close: confirmRestartClose },
  ] = useDisclosure(false)

  const [changedRestartSettings, setChangedRestartSettings] = useState([])

  function closeCheckRestart() {
    const changedRestartSettings = []
    Object.entries(DefaultSettings).forEach(([section, sectionSettings]) => {
      Object.entries(sectionSettings).forEach(([key, def]) => {
        const fullKey = `${section}.${key}`
        const changed =
          JSON.stringify(getSetting(fullKey)) !==
          JSON.stringify(initialSettings[fullKey])

        if (changed && def.requireRestart) {
          changedRestartSettings.push(fullKey)
        }
      })
    })

    setChangedRestartSettings(changedRestartSettings)

    if (changedRestartSettings.length > 0) {
      confirmRestartOpen()
    } else {
      close()
    }
  }

  useEffect(() => {
    if (opened) {
      const snapshot = {}

      Object.entries(DefaultSettings).forEach(([section, sectionSettings]) => {
        Object.entries(sectionSettings).forEach(([key]) => {
          const fullKey = `${section}.${key}`
          snapshot[fullKey] = getSetting(fullKey)
        })
      })

      setInitialSettings(snapshot)
    }
  }, [opened])

  return (
    <>
      <Modal
        centered
        onClose={closeCheckRestart}
        title={
          <Group gap="xs">
            <IconSettings size={20} />
            <Text fw={500}>User Settings</Text>
          </Group>
        }
        opened={opened}
        size="xl"
        styles={{
          content: {
            height: "60vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "dark",
          },
          header: { backgroundColor: "dark", flexShrink: 0 },
          body: { flex: 1, overflow: "hidden" },
          transform: "translateZ(0)",
        }}
        bg="dark"
        radius="15px"
        shadow="xs"
      >
        <Tabs
          defaultValue="General"
          orientation="vertical"
          className="dark"
          color="red"
          h="100%"
          styles={{
            root: { height: "100%", display: "flex" },
            list: {
              minWidth: "100px",
              transform: "translateZ(0)",
            },
            panel: {
              height: "100%",
              overflow: "hidden",
              transform: "translateZ(0)",
            },
            tab: { paddingLeft: 8, marginLeft: 0 },
          }}
        >
          <Tabs.List>
            {settingTabs.map((t) => {
              // Only show developer tag when developer features are on
              if (
                !getSetting("General.experimentalDeveloperFeatures") &&
                t === "Developer"
              ) {
                return <></>
              }
              return (
                <Tabs.Tab key={t} value={t}>
                  {t}
                </Tabs.Tab>
              )
            })}
          </Tabs.List>
          <ScrollArea
            w="100%"
            h="100%"
            type="auto"
            viewportProps={{ style: { transform: "translateZ(0)" } }}
          >
            {settingTabs.map((tab) => {
              const tabSettings = DefaultSettings[tab]
              const groupedSettings = {}

              Object.entries(tabSettings).forEach(([key, def]) => {
                const group = def.group || "Ungrouped"
                if (!groupedSettings[group]) {
                  groupedSettings[group] = []
                }
                groupedSettings[group].push({ key, def })
              })

              return (
                <Tabs.Panel className="space-y-6" value={tab} key={tab}>
                  {Object.keys(groupedSettings).map((group) => (
                    <div className="pb-2" key={group}>
                      {group !== "Ungrouped" && (
                        <h2 className="text-lg font-semibold px-10 pb-2">
                          {group}
                        </h2>
                      )}
                      <div className="space-y-4">
                        {groupedSettings[group].map(({ key, def }) => (
                          <Setting
                            key={`${tab}.${key}`}
                            settingName={`${tab}.${key}`}
                            df={def}
                            initialValue={initialSettings[`${tab}.${key}`]}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {Object.keys(tabSettings).length === 0 && (
                    <p className="pl-4 pt-2">
                      No settings available right now.
                    </p>
                  )}
                  {tab === "General" && (
                    <div className="pt-4">
                      <ReleaseCheckRow />
                    </div>
                  )}
                  {tab === "Developer" && (
                    <>
                      <SetRatesRow />
                    </>
                  )}
                </Tabs.Panel>
              )
            })}
          </ScrollArea>
        </Tabs>
      </Modal>
      <Modal
        opened={confirmRestartOpened}
        onClose={confirmRestartClose}
        title="Restart Required"
        centered
        withCloseButton={false}
      >
        <p className="mb-2">
          The following changes require a restart to take effect. Restart now?
        </p>
        <div className="mb-4">
          {changedRestartSettings.map((setting) => (
            <p key={setting}>
              {
                setting
                  .split(".")
                  .reduce((title, value) => title[value], DefaultSettings)[
                  "display"
                ]
              }
            </p>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="default"
            onClick={() => {
              close()
              confirmRestartClose()
            }}
          >
            Restart Later
          </Button>
          <Button
            color="red"
            onClick={() => {
              window.ipcRenderer.send("window:force-reload")
            }}
          >
            Restart Now
          </Button>
        </div>
      </Modal>
    </>
  )
}

// If settings don't change then the modal does not need to re-render
export default memo(SettingsModal)
