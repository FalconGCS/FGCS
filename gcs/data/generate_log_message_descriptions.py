import json
import lzma
import os

import defusedxml.ElementTree as ET
import requests

# https://autotest.ardupilot.org/LogMessages/
log_message_defs = [
    [
        "https://autotest.ardupilot.org/LogMessages/Copter/LogMessages.xml.xz",
        "gen_log_messages_desc_copter.json",
    ],
    [
        "https://autotest.ardupilot.org/LogMessages/Plane/LogMessages.xml.xz",
        "gen_log_messages_desc_plane.json",
    ],
]

temp_file_name = "temp.LogMessages.xml.xz"

if os.path.exists(temp_file_name):
    os.remove(temp_file_name)

for url, output_filename in log_message_defs:
    try:
        print(f"Downloading {url}...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(temp_file_name, "wb") as f:
            f.write(response.content)

        # Validate file was downloaded
        if not os.path.exists(temp_file_name):
            raise FileNotFoundError(f"Failed to download {url}")

        # Try to decompress and read the data
        try:
            with lzma.open(temp_file_name) as f:
                data = f.read()
        except lzma.LZMAError as e:
            raise ValueError(f"Failed to decompress XZ file: {e}")

        # Parse XML
        root = ET.fromstring(data)

        # Convert XML to JSON structure
        log_messages = {}

        for log_msg in root.findall("logformat"):
            name = log_msg.get("name")
            if name:
                fields = {}

                # Get all field elements
                for field in log_msg.findall("fields/field"):
                    field_name = field.get("name")
                    # Skip fields without a name attribute
                    if not field_name:
                        continue

                    field_description_elem = field.find("description")
                    field_description = ""
                    if (
                        field_description_elem is not None
                        and field_description_elem.text
                    ):
                        field_description = field_description_elem.text.strip()

                    field_info = {
                        "type": field.get("type"),
                        "units": field.get("units", ""),
                        "description": field_description,
                    }
                    fields[field_name] = field_info

                # Get description
                description_elem = log_msg.find("description")
                description = ""
                if description_elem is not None and description_elem.text:
                    description = description_elem.text.strip()

                log_messages[name] = {"description": description, "fields": fields}

        # Sort by message name and write to JSON file
        sorted_log_messages = dict(sorted(log_messages.items()))

        with open(output_filename, "w") as f:
            json.dump(sorted_log_messages, f)

        print(f"Generated {output_filename}")

    except requests.exceptions.RequestException as e:
        print(f"Error downloading {url}: {e}")
        print(f"Skipping {output_filename}")
        continue
    except (ValueError, lzma.LZMAError) as e:
        print(f"Error processing downloaded file: {e}")
        print(f"Skipping {output_filename}")
        continue
    except ET.ParseError as e:
        print(f"Error parsing XML: {e}")
        print(f"Skipping {output_filename}")
        continue
    except Exception as e:
        print(f"Unexpected error processing {url}: {e}")
        print(f"Skipping {output_filename}")
        continue

if os.path.exists(temp_file_name):
    os.remove(temp_file_name)

print("Generated log message description files")
