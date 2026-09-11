/*
  The Checklist area, this can be edited.
*/

// Native imports
import { useState } from "react"

// 3rd Party Imports
import { ActionIcon, Button, Checkbox, Modal, Tooltip } from "@mantine/core"
import {
  IconCheckbox,
  IconDownload,
  IconEdit,
  IconTrashX,
} from "@tabler/icons-react"

// Local Imports
import EditCheckList from "./checkListEdit.jsx"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  deleteChecklistById,
  selectChecklistById,
  setChecklistValueById,
} from "../../../redux/slices/checklistSlice.js"

export default function CheckListArea({ id }) {
  const dispatch = useDispatch()
  const checklist = useSelector(selectChecklistById(id))

  const [showDeleteModal, setDeleteModal] = useState(false)
  const [editCheckListModal, setEditCheckListModal] = useState(false)
  const [lastToggleCheck, setLastToggleCheck] = useState(false) // false = uncheck, true = check

  function toggleCheck() {
    const updated = checklist.value.map((item) =>
      item.stateBinding ? item : { ...item, checked: lastToggleCheck },
    )

    if (JSON.stringify(checklist.value) !== JSON.stringify(updated)) {
      dispatch(setChecklistValueById({ id: checklist.id, value: updated }))
    }

    setLastToggleCheck(!lastToggleCheck)
  }

  function setChecked(name, value) {
    const updated = checklist.value.map((item) => {
      if (item.name !== name || item.stateBinding) {
        return item
      }

      return { ...item, checked: value }
    })

    // Check our checklist value is not the same as the updated one to stop unnecessary redux calls
    if (JSON.stringify(checklist.value) !== JSON.stringify(updated)) {
      dispatch(setChecklistValueById({ id: checklist.id, value: updated }))
    }
  }

  function exportList() {
    // Remove id from checklist before exporting as it gets regenerated on importing
    let { ...sanitizedChecklist } = checklist
    delete sanitizedChecklist.id
    const downloadElement = document.createElement("a")
    const file = new Blob([JSON.stringify(sanitizedChecklist)], {
      type: "text/plain",
    })

    // Simulating clicking a link to download
    const objectUrl = URL.createObjectURL(file)
    downloadElement.href = objectUrl
    downloadElement.download = `${checklist.name}.checklist`
    document.body.appendChild(downloadElement)
    downloadElement.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <>
      {/* Checkbox area */}
      <div className="flex flex-col gap-2">
        <div className="flex w-full justify-between pb-2">
          <div className="flex gap-1">
            <Tooltip label="Toggle Checked">
              <ActionIcon variant="light" onClick={() => toggleCheck()}>
                <IconCheckbox size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit List">
              <ActionIcon
                variant="light"
                onClick={() => setEditCheckListModal(true)}
              >
                <IconEdit size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Export List">
              <ActionIcon variant="light" onClick={() => exportList()}>
                <IconDownload size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="flex gap-1">
            <Tooltip label="Delete List">
              <ActionIcon
                variant="light"
                color="red"
                onClick={() => setDeleteModal(true)}
              >
                <IconTrashX size={20} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>

        {checklist.value.map((item, index) => (
          <Tooltip
            label="Auto completing field, this can't be manually checked"
            disabled={item.stateBinding == null}
            openDelay={500}
            key={`${item.name}-${index}`}
          >
            <Checkbox
              checked={item.checked}
              key={`${item.name}-${index}`}
              label={item.name}
              onChange={() => setChecked(item.name, !item.checked)}
            />
          </Tooltip>
        ))}
      </div>

      {/* Edit mode */}
      <EditCheckList
        checklist={checklist}
        opened={editCheckListModal}
        close={() => setEditCheckListModal(false)}
      />

      {/* Generic "are you sure" modal */}
      <Modal
        opened={showDeleteModal}
        onClose={() => setDeleteModal(false)}
        title="Are you sure you want to delete this checklist?"
        centered
        styles={{
          content: {
            borderRadius: "0.5rem",
          },
        }}
        withCloseButton={false}
      >
        <div className="flex w-full justify-between pt-4">
          <Button color={"red"} onClick={() => setDeleteModal(false)}>
            No, cancel
          </Button>
          <Button
            color="green"
            onClick={() => dispatch(deleteChecklistById(checklist.id))}
            data-autofocus
          >
            Yes, Delete
          </Button>
        </div>
      </Modal>
    </>
  )
}
