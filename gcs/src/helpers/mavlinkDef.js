import * as ardupilotmega from "mavlink-mappings/dist/lib/ardupilotmega"
import * as common from "mavlink-mappings/dist/lib/common"
import * as minimal from "mavlink-mappings/dist/lib/minimal"
import * as standard from "mavlink-mappings/dist/lib/standard"
import * as uavionix from "mavlink-mappings/dist/lib/uavionix"

export const mavlinkDef = {
  ...minimal,
  ...common,
  ...standard,
  ...ardupilotmega,
  ...uavionix,
}
