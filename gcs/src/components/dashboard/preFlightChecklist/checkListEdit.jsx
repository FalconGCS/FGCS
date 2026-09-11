/*
  The modal to edit a checklist
*/

// Native Imports
import { useEffect, useState } from "react"

// 3rd Party Imports
import { ActionIcon, Button, Modal, TextInput, Select } from "@mantine/core"
import { IconPlus, IconTrashX } from "@tabler/icons-react"

// Helpers
import { CHECKLIST_AUTO_BINDING_OPTIONS } from "../../../helpers/checklistAutoBindings.js"

// Redux
import { useDispatch } from "react-redux"
import {
  setChecklistValueById,
  setNewChecklistName,
} from "../../../redux/slices/checklistSlice.js"

export default function EditCheckList({ checklist, opened, close }) {
  const dispatch = useDispatch()
  const [name, setName] = useState(checklist.name)
  const [items, setItems] = useState(checklist.value ?? [])

  const autoChecklistBindingsOptions = CHECKLIST_AUTO_BINDING_OPTIONS.map(
    (item) => ({
      value: item.key,
      label: item.label,
    }),
  )

  useEffect(() => {
    if (!opened) {
      return
    }

    setName(checklist.name)
    setItems(checklist.value ?? [])
  }, [opened, checklist.id])

  function updateItem(index, key, value) {
    setItems((currentItems) =>
      currentItems.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }

        if (key === "stateBinding") {
          const trimmedValue = typeof value === "string" ? value.trim() : ""
          return {
            ...item,
            stateBinding: trimmedValue === "" ? null : trimmedValue,
          }
        }

        return { ...item, [key]: value }
      }),
    )
  }

  function removeItem(index) {
    setItems((currentItems) =>
      currentItems.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  function addItem() {
    setItems((currentItems) => [
      ...currentItems,
      { name: "", checked: false, stateBinding: null },
    ])
  }

  function handleSave(event) {
    event.preventDefault()
    dispatch(setNewChecklistName({ id: checklist.id, newName: name }))
    dispatch(setChecklistValueById({ id: checklist.id, value: items }))
    close()
  }

  return (
    <Modal
      title="Edit Checklist"
      opened={opened}
      onClose={() => close()}
      styles={{
        content: {
          borderRadius: "0.5rem",
        },
      }}
      size={"xl"}
      centered
    >
      <form onSubmit={handleSave}>
        <div className="flex flex-col gap-4">
          {/* Inputs */}
          <h1>Checklist Name</h1>
          <TextInput
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />

          <div className="flex flex-col gap-3">
            <div className="flex w-full gap-2">
              <h1 className="w-1/2">List Item</h1>
              <h1>Auto complete?</h1>
            </div>
            {items.map((item, index) => (
              <div key={item.id} className="flex w-full gap-2">
                <TextInput
                  value={item.name}
                  onChange={(event) =>
                    updateItem(index, "name", event.currentTarget.value)
                  }
                  className="w-1/2"
                />
                <Select
                  placeholder="No auto completion"
                  data={autoChecklistBindingsOptions}
                  clearable
                  onChange={(value) => {
                    updateItem(index, "stateBinding", value)
                    updateItem(index, "checked", false)
                  }}
                  value={item.stateBinding ?? null}
                  className="grow"
                />
                <ActionIcon
                  color="red"
                  variant="light"
                  type="button"
                  onClick={() => removeItem(index)}
                  className="self-stretch !h-auto"
                >
                  <IconTrashX size={20} stroke={1.5} />
                </ActionIcon>
              </div>
            ))}

            <Button
              leftSection={<IconPlus size={16} />}
              onClick={addItem}
              type="button"
              variant="light"
            >
              Add Item
            </Button>
          </div>

          {/* Controls */}
          <div className="w-full flex justify-between pt-2">
            <Button
              onClick={close}
              type="button"
              variant="filled"
              color={"red"}
            >
              Cancel
            </Button>
            <Button type="submit" variant="filled" color={"green"}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
