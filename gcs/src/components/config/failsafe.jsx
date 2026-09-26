import { useEffect } from "react"

import { LoadingOverlay, NumberInput, Select, Switch } from "@mantine/core"
import { useDebouncedCallback } from "@mantine/hooks"

import { useDispatch, useSelector } from "react-redux"

import { useParamDefinitions } from "../../helpers/paramDefinitions"

import {
  emitGetFailsafeConfig,
  emitSetFailsafeConfigParam,
  selectFailsafeConfig,
} from "../../redux/slices/configSlice"
import {
  emitSetState,
  selectConnectedToDrone,
} from "../../redux/slices/droneConnectionSlice"
import { selectAircraftTypeString } from "../../redux/slices/droneInfoSlice"

export default function Failsafes() {
  const dispatch = useDispatch()
  const connected = useSelector(selectConnectedToDrone)
  const failsafeConfig = useSelector(selectFailsafeConfig)
  const { paramDefs } = useParamDefinitions()
  const aircraftTypeString = useSelector(selectAircraftTypeString)

  const debouncedUpdate = useDebouncedCallback((param_id, value) => {
    dispatch(emitSetFailsafeConfigParam({ param_id, value }))
  }, 500)

  useEffect(() => {
    if (!connected) {
      return
    }

    dispatch(emitSetState("config.failsafe"))
    dispatch(emitGetFailsafeConfig())
  }, [connected, dispatch])

  if (Object.keys(paramDefs).length === 0)
    return (
      <div className="relative size-full">
        <LoadingOverlay
          visible={true}
          zIndex={1000}
          overlayProps={{ blur: 2 }}
        />
      </div>
    )

  return (
    <div className="relative size-full">
      <div className="max-w-screen-lg p-4 space-y-16">
        <div className="space-y-2">
          <h1 className="text-lg font-bold tracking-wide pb-2">
            Battery Failsafe
          </h1>
          <div className="grid grid-cols-2 gap-16">
            <div className="space-y-4">
              <h2 className="font-semibold">Low Battery</h2>
              <div className="grid grid-cols-2 gap-4">
                <NumberInput
                  hideControls
                  label="Voltage Threshold"
                  description="Set to 0 to disable."
                  suffix="V"
                  min={0}
                  value={failsafeConfig.BATT_LOW_VOLT}
                  onChange={(value) =>
                    debouncedUpdate("BATT_LOW_VOLT", Number(value))
                  }
                  disabled={failsafeConfig.BATT_LOW_VOLT == undefined}
                />
                <NumberInput
                  hideControls
                  label="Capacity Threshold"
                  description="Set to 0 to disable."
                  suffix="mAh"
                  min={0}
                  value={failsafeConfig.BATT_LOW_MAH}
                  onChange={(value) =>
                    debouncedUpdate("BATT_LOW_MAH", Number(value))
                  }
                  disabled={failsafeConfig.BATT_LOW_MAH == undefined}
                />
              </div>
              <Select
                label="Failsafe Low Action"
                allowDeselect={false}
                value={String(failsafeConfig.BATT_FS_LOW_ACT)}
                data={Object.keys(paramDefs.BATT_FS_LOW_ACT.Values).map(
                  (key) => ({
                    value: `${key}`,
                    label: `${key}: ${paramDefs.BATT_FS_LOW_ACT.Values[key]}`,
                  }),
                )}
                onChange={(value) => {
                  dispatch(
                    emitSetFailsafeConfigParam({
                      param_id: "BATT_FS_LOW_ACT",
                      value: Number(value),
                    }),
                  )
                }}
                disabled={failsafeConfig.BATT_FS_LOW_ACT == undefined}
              />
            </div>

            <div className="space-y-4">
              <h2 className="font-semibold">Critical Battery</h2>
              <div className="grid grid-cols-2 gap-4">
                <NumberInput
                  hideControls
                  label="Voltage Threshold"
                  description="Set to 0 to disable."
                  suffix="V"
                  min={0}
                  value={failsafeConfig.BATT_CRT_VOLT}
                  onChange={(value) =>
                    debouncedUpdate("BATT_CRT_VOLT", Number(value))
                  }
                  disabled={failsafeConfig.BATT_CRT_VOLT == undefined}
                />
                <NumberInput
                  hideControls
                  label="Capacity Threshold"
                  description="Set to 0 to disable."
                  suffix="mAh"
                  min={0}
                  value={failsafeConfig.BATT_CRT_MAH}
                  onChange={(value) =>
                    debouncedUpdate("BATT_CRT_MAH", Number(value))
                  }
                  disabled={failsafeConfig.BATT_CRT_MAH == undefined}
                />
              </div>
              <Select
                label="Failsafe Critical Action"
                allowDeselect={false}
                value={String(failsafeConfig.BATT_FS_CRT_ACT)}
                data={Object.keys(paramDefs.BATT_FS_CRT_ACT.Values).map(
                  (key) => ({
                    value: `${key}`,
                    label: `${key}: ${paramDefs.BATT_FS_CRT_ACT.Values[key]}`,
                  }),
                )}
                onChange={(value) => {
                  dispatch(
                    emitSetFailsafeConfigParam({
                      param_id: "BATT_FS_CRT_ACT",
                      value: Number(value),
                    }),
                  )
                }}
                disabled={failsafeConfig.BATT_FS_CRT_ACT == undefined}
              />
            </div>
          </div>
        </div>

        {aircraftTypeString === "Copter" && (
          <>
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-16">
                <div className="space-y-2">
                  <h1 className="text-lg font-bold tracking-wide pb-2">
                    Radio Failsafe
                  </h1>
                  <div className="space-y-4">
                    <NumberInput
                      hideControls
                      label="RC Timeout"
                      suffix="s"
                      min={0}
                      value={failsafeConfig.RC_FS_TIMEOUT}
                      onChange={(value) =>
                        debouncedUpdate("RC_FS_TIMEOUT", Number(value))
                      }
                      disabled={failsafeConfig.RC_FS_TIMEOUT == undefined}
                    />
                    <Select
                      label="Throttle Failsafe Enable"
                      allowDeselect={false}
                      value={String(failsafeConfig.FS_THR_ENABLE)}
                      data={Object.keys(paramDefs.FS_THR_ENABLE.Values).map(
                        (key) => ({
                          value: `${key}`,
                          label: `${key}: ${paramDefs.FS_THR_ENABLE.Values[key]}`,
                        }),
                      )}
                      onChange={(value) => {
                        dispatch(
                          emitSetFailsafeConfigParam({
                            param_id: "FS_THR_ENABLE",
                            value: Number(value),
                          }),
                        )
                      }}
                      disabled={failsafeConfig.FS_THR_ENABLE == undefined}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-lg font-bold tracking-wide pb-2">
                    GCS Failsafe
                  </h1>
                  <div className="space-y-4">
                    <NumberInput
                      hideControls
                      label="GCS Timeout"
                      suffix="s"
                      min={0}
                      value={failsafeConfig.FS_GCS_TIMEOUT}
                      onChange={(value) =>
                        debouncedUpdate("FS_GCS_TIMEOUT", Number(value))
                      }
                      disabled={failsafeConfig.FS_GCS_TIMEOUT == undefined}
                    />
                    <Select
                      label="GCS Failsafe Enable"
                      allowDeselect={false}
                      value={String(failsafeConfig.FS_GCS_ENABLE)}
                      data={Object.keys(paramDefs.FS_GCS_ENABLE.Values).map(
                        (key) => ({
                          value: `${key}`,
                          label: `${key}: ${paramDefs.FS_GCS_ENABLE.Values[key]}`,
                        }),
                      )}
                      onChange={(value) => {
                        dispatch(
                          emitSetFailsafeConfigParam({
                            param_id: "FS_GCS_ENABLE",
                            value: Number(value),
                          }),
                        )
                      }}
                      disabled={failsafeConfig.FS_GCS_ENABLE == undefined}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-2">
                <h1 className="text-lg font-bold tracking-wide pb-2">
                  EKF Failsafe
                </h1>
                <div className="space-y-4">
                  <NumberInput
                    hideControls
                    label="EKF Threshold"
                    min={0}
                    value={failsafeConfig.FS_EKF_THRESH}
                    onChange={(value) =>
                      debouncedUpdate("FS_EKF_THRESH", Number(value))
                    }
                    disabled={failsafeConfig.FS_EKF_THRESH == undefined}
                  />
                  <Select
                    label="EKF Failsafe Action"
                    allowDeselect={false}
                    value={String(failsafeConfig.FS_EKF_ACTION)}
                    data={Object.keys(paramDefs.FS_EKF_ACTION.Values).map(
                      (key) => ({
                        value: `${key}`,
                        label: `${key}: ${paramDefs.FS_EKF_ACTION.Values[key]}`,
                      }),
                    )}
                    onChange={(value) => {
                      dispatch(
                        emitSetFailsafeConfigParam({
                          param_id: "FS_EKF_ACTION",
                          value: Number(value),
                        }),
                      )
                    }}
                    disabled={failsafeConfig.FS_EKF_ACTION == undefined}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {aircraftTypeString === "Plane" && (
          <>
            <div className="space-y-2">
              <h1 className="text-lg font-bold tracking-wide pb-2">
                RC Failsafe
              </h1>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h2 className="font-semibold">Short Failsafe</h2>
                  <NumberInput
                    hideControls
                    label="Short Timeout"
                    suffix="s"
                    min={0}
                    value={failsafeConfig.FS_SHORT_TIMEOUT}
                    onChange={(value) =>
                      debouncedUpdate("FS_SHORT_TIMEOUT", Number(value))
                    }
                    disabled={failsafeConfig.FS_SHORT_TIMEOUT == undefined}
                  />
                  <Select
                    label="Short Action"
                    allowDeselect={false}
                    value={String(failsafeConfig.FS_SHORT_ACTN)}
                    data={Object.keys(paramDefs.FS_SHORT_ACTN.Values).map(
                      (key) => ({
                        value: `${key}`,
                        label: `${key}: ${paramDefs.FS_SHORT_ACTN.Values[key]}`,
                      }),
                    )}
                    onChange={(value) => {
                      dispatch(
                        emitSetFailsafeConfigParam({
                          param_id: "FS_SHORT_ACTN",
                          value: Number(value),
                        }),
                      )
                    }}
                    disabled={failsafeConfig.FS_SHORT_ACTN == undefined}
                  />
                </div>
                <div className="space-y-4">
                  <h2 className="font-semibold">Long Failsafe</h2>
                  <NumberInput
                    hideControls
                    label="Long Timeout"
                    suffix="s"
                    min={0}
                    value={failsafeConfig.FS_LONG_TIMEOUT}
                    onChange={(value) =>
                      debouncedUpdate("FS_LONG_TIMEOUT", Number(value))
                    }
                    disabled={failsafeConfig.FS_LONG_TIMEOUT == undefined}
                  />
                  <Select
                    label="Long Action"
                    allowDeselect={false}
                    value={String(failsafeConfig.FS_LONG_ACTN)}
                    data={Object.keys(paramDefs.FS_LONG_ACTN.Values).map(
                      (key) => ({
                        value: `${key}`,
                        label: `${key}: ${paramDefs.FS_LONG_ACTN.Values[key]}`,
                      }),
                    )}
                    onChange={(value) => {
                      dispatch(
                        emitSetFailsafeConfigParam({
                          param_id: "FS_LONG_ACTN",
                          value: Number(value),
                        }),
                      )
                    }}
                    disabled={failsafeConfig.FS_LONG_ACTN == undefined}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h1 className="font-semibold">Throttle Failsafe</h1>
                    <Switch
                      checked={failsafeConfig.THR_FAILSAFE}
                      onChange={(value) =>
                        debouncedUpdate("THR_FAILSAFE", Number(value))
                      }
                      disabled={failsafeConfig.THR_FAILSAFE == undefined}
                    />
                  </div>
                  <NumberInput
                    hideControls
                    label="Throttle Threshold"
                    value={failsafeConfig.THR_FS_VALUE}
                    suffix="µs"
                    min={925}
                    max={2200}
                    onChange={(value) =>
                      debouncedUpdate("THR_FS_VALUE", Number(value))
                    }
                    disabled={!failsafeConfig.THR_FAILSAFE}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="flex flex-col">
                <h1 className="text-lg font-bold tracking-wide pb-2">
                  GCS Failsafe
                </h1>
                <Select
                  allowDeselect={false}
                  value={String(failsafeConfig.FS_GCS_ENABL)}
                  data={Object.keys(paramDefs.FS_GCS_ENABL.Values).map(
                    (key) => ({
                      value: `${key}`,
                      label: `${key}: ${paramDefs.FS_GCS_ENABL.Values[key]}`,
                    }),
                  )}
                  onChange={(value) => {
                    dispatch(
                      emitSetFailsafeConfigParam({
                        param_id: "FS_GCS_ENABL",
                        value: Number(value),
                      }),
                    )
                  }}
                  disabled={failsafeConfig.FS_GCS_ENABL == undefined}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
