/**
 * PreFlightCheckListSection
 * Contains the preflight checklist
 */

// Native imports
import { useEffect, useState } from "react"

// 3rd Party Imports
import { Accordion, Button, Modal, Tabs, TextInput } from "@mantine/core"

// Local imports
import CheckListArea from "../preFlightChecklist/checkListArea.jsx"

// Other
import { AddCommand } from "../../spotlight/commandHandler.js"

// Styling imports
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../../helpers/notification.js"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  pushChecklist,
  selectChecklists,
} from "../../../redux/slices/checklistSlice.js"

export default function PreFlightChecklistTab({ tabPadding }) {
  const dispatch = useDispatch()
  const preFlightChecklistItems = useSelector(selectChecklists)

  // New checklist
  const [showNewChecklistModal, setNewChecklistModal] = useState(false)
  const [newChecklistName, setNewChecklistName] = useState("")

  function doesChecklistExist(name) {
    return (
      preFlightChecklistItems.find(
        (element) => element.name.toLowerCase() === name.toLowerCase(),
      ) !== undefined
    )
  }

  function createNewChecklist(name, value) {
    if (!name) {
      name = newChecklistName
    }
    if (doesChecklistExist(name)) {
      // In the future we can make this show a popup and allow them to change the name
      showErrorNotification(`A checklist called '${name}' already exists`)
      return
    }
    if (!value) {
      value = [
        {
          checked: false,
          name: "Your first item, press edit to add more!",
          stateBinding: null,
        },
      ]
    }

    if (name === "") {
      showErrorNotification("Name cannot be empty")
      return
    }

    dispatch(
      pushChecklist({
        name: name,
        value: value,
      }),
    )
    setNewChecklistModal(false)
    setNewChecklistName("")
  }

  useEffect(() => {
    AddCommand("new_preflight_checklist", () => setNewChecklistModal(true))
  }, [])

  // Import checklist
  async function openChecklistFile() {
    const result = await window.ipcRenderer.invoke("checklist:open")

    if (result?.success) {
      let checklistObject
      try {
        checklistObject = JSON.parse(result.file.contents)
      } catch {
        showErrorNotification("Invalid JSON in checklist file")
        return
      }

      // Create checklist and show notification
      createNewChecklist(checklistObject.name, checklistObject.value)
      showSuccessNotification(
        `Checklist '${checklistObject.name}' imported successfully`,
      )
    } else if (result) {
      showErrorNotification(result.error)
    }
  }

  return (
    <Tabs.Panel value="preFlightChecklist">
      <div className={tabPadding}>
        {/* The list of checklist */}
        <Accordion variant="separated">
          {preFlightChecklistItems.map((item) => (
            <Accordion.Item key={item.id} value={item.name}>
              <Accordion.Control>{item.name}</Accordion.Control>
              <Accordion.Panel>
                <CheckListArea id={item.id} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
        {/* Controls */}
        <Button
          className="!w-full !mt-4"
          onClick={() => setNewChecklistModal(true)}
        >
          Add a new Checklist
        </Button>
        <Button className="!w-full !mt-2" onClick={() => openChecklistFile()}>
          Import from Checklist file
        </Button>

        {/* New checklist modal */}
        <Modal
          opened={showNewChecklistModal}
          onClose={() => setNewChecklistModal(false)}
          title="New Checklist"
          centered
          styles={{
            content: {
              borderRadius: "0.5rem",
            },
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createNewChecklist()
            }}
          >
            <div className="flex flex-col gap-2">
              <TextInput
                label="Checklist Name"
                description="The name of the checklist, you can add values afterwards"
                value={newChecklistName}
                onChange={(event) =>
                  setNewChecklistName(event.currentTarget.value)
                }
                data-autofocus
              />
            </div>

            <div className="flex w-full justify-between pt-6">
              <Button color={"red"} onClick={() => setNewChecklistModal(false)}>
                Cancel
              </Button>
              <Button color={"green"} onClick={() => createNewChecklist()}>
                Create
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </Tabs.Panel>
  )
}
