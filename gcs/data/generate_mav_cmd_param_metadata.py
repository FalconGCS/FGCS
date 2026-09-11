import json
import os
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# MAVLink message definitions from ArduPilot's fork, which is authoritative for
# the MAV_CMD ids ArduPilot actually implements.
XML_RAW_ROOT = (
    "https://raw.githubusercontent.com/ArduPilot/mavlink/master/message_definitions/v1.0"
)
ROOT_DIALECT = "ardupilotmega.xml"
OUTPUT_FILENAME = "gen_mav_cmd_param_meta.json"
REQUEST_TIMEOUT_SECONDS = 30

# Params 5-7 are the x/y/z columns. They're included so the same metadata can
# label those too.
MAX_PARAM_INDEX = 7


def fetch_xml(filename: str) -> ET.Element:
    url = f"{XML_RAW_ROOT}/{filename}"
    print(f"Downloading {url}...")
    request = Request(url, headers={"User-Agent": "FGCS MAV_CMD Metadata Generator"})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return ET.fromstring(response.read())


def collapse_whitespace(text: str | None) -> str:
    if not text:
        return ""

    return re.sub(r"\s+", " ", text).strip()


def parse_mav_cmd_entries(root: ET.Element) -> dict[str, dict[str, Any]]:
    # Only look inside the MAV_CMD enum: entry values are not unique across
    # enums (MAV_CMD 16 collides with TRACKER_MODE 16, for example).
    commands: dict[str, dict[str, Any]] = {}

    for enum in root.iter("enum"):
        if enum.get("name") != "MAV_CMD":
            continue

        for entry in enum.findall("entry"):
            value = entry.get("value")
            name = entry.get("name")
            if value is None or name is None:
                continue

            try:
                command_id = str(int(value))
            except ValueError:
                continue

            params: dict[str, dict[str, str]] = {}
            for param in entry.findall("param"):
                index = param.get("index")
                if index is None:
                    continue

                try:
                    param_index = int(index)
                except ValueError:
                    continue

                if param_index < 1 or param_index > MAX_PARAM_INDEX:
                    continue

                params[str(param_index)] = {
                    "label": param.get("label", ""),
                    "units": param.get("units", ""),
                    "description": collapse_whitespace(param.text),
                }

            description_elem = entry.find("description")
            description = ""
            if description_elem is not None:
                description = collapse_whitespace(description_elem.text)

            commands[command_id] = {
                "name": name,
                "description": description,
                "params": params,
            }

    return commands


def collect_commands(
    filename: str, visited: set[str], commands: dict[str, dict[str, Any]]
) -> None:
    """Walk a dialect and its includes, merging deepest-first so that the more
    specific (shallower) dialect wins on conflicting command ids."""

    if filename in visited:
        return

    visited.add(filename)
    root = fetch_xml(filename)

    for include in root.findall("include"):
        included_filename = collapse_whitespace(include.text)
        if included_filename:
            collect_commands(included_filename, visited, commands)

    commands.update(parse_mav_cmd_entries(root))


def main() -> None:
    commands: dict[str, dict[str, Any]] = {}

    try:
        collect_commands(ROOT_DIALECT, set(), commands)
    except (HTTPError, URLError) as e:
        print(f"Error downloading MAVLink message definitions: {e}")
        print(f"Skipping {OUTPUT_FILENAME}")
        return
    except ET.ParseError as e:
        print(f"Error parsing MAVLink message definitions: {e}")
        print(f"Skipping {OUTPUT_FILENAME}")
        return

    if not commands:
        print("No MAV_CMD entries found")
        print(f"Skipping {OUTPUT_FILENAME}")
        return

    sorted_commands = {
        command_id: commands[command_id]
        for command_id in sorted(commands, key=lambda value: int(value))
    }

    if os.path.exists(OUTPUT_FILENAME):
        os.remove(OUTPUT_FILENAME)

    with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
        json.dump(sorted_commands, f, separators=(",", ":"))

    print(f"Generated {OUTPUT_FILENAME} with {len(sorted_commands)} MAV_CMD entries")


if __name__ == "__main__":
    main()
