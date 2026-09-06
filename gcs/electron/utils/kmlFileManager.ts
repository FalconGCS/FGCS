import { app } from "electron"
import * as fs from "fs"
import * as path from "path"
import type { KmlLayerIndexEntry } from "../types/kmlTypes"

export default function createKmlFileManager() {
  // Directory holding a copy of every imported KML
  const kmlDirectory: string = path.join(app.getPath("userData"), "kmlLayers")

  // JSON file holding the metadata for each stored KML
  const kmlIndexPath: string = path.join(
    app.getPath("userData"),
    "kmlLayers.json",
  )

  function ensureDirectory(): void {
    if (!fs.existsSync(kmlDirectory)) {
      fs.mkdirSync(kmlDirectory, { recursive: true })
    }
  }

  function isValidEntry(entry: unknown): entry is KmlLayerIndexEntry {
    return (
      typeof entry === "object" &&
      entry !== null &&
      "id" in entry &&
      "name" in entry &&
      "storedFileName" in entry
    )
  }

  function loadIndex(): KmlLayerIndexEntry[] {
    try {
      if (!fs.existsSync(kmlIndexPath)) return []

      const parsed = JSON.parse(fs.readFileSync(kmlIndexPath, "utf8"))
      if (!Array.isArray(parsed)) return []

      return parsed.filter(isValidEntry)
    } catch (error) {
      console.error("Error loading KML index:", error)
      return []
    }
  }

  let kmlIndex: KmlLayerIndexEntry[] = loadIndex()

  function saveIndex(): void {
    try {
      fs.writeFileSync(kmlIndexPath, JSON.stringify(kmlIndex), "utf8")
    } catch (error) {
      console.error("Error saving KML index:", error)
    }
  }

  function storedPathFor(entry: KmlLayerIndexEntry): string {
    return path.join(kmlDirectory, entry.storedFileName)
  }

  return {
    async addKmlFile(
      id: string,
      originalPath: string,
      contents: string,
    ): Promise<KmlLayerIndexEntry> {
      ensureDirectory()

      const storedFileName = `${id}.kml`
      await fs.promises.writeFile(
        path.join(kmlDirectory, storedFileName),
        contents,
        "utf8",
      )

      const existing = kmlIndex.find(
        (entry) => entry.originalPath === originalPath,
      )
      if (existing) {
        // Remove the previous copy, its stored file name is keyed on the old id
        try {
          fs.unlinkSync(storedPathFor(existing))
        } catch {
          // nothing to clean up
        }
        kmlIndex = kmlIndex.filter((entry) => entry.id !== existing.id)
      }

      const entry: KmlLayerIndexEntry = {
        id,
        name: path.basename(originalPath),
        originalPath,
        storedFileName,
        importedAt: Date.now(),
      }
      kmlIndex.push(entry)
      saveIndex()

      return entry
    },

    async getKmlFiles(): Promise<
      (KmlLayerIndexEntry & { contents: string })[]
    > {
      const layers: (KmlLayerIndexEntry & { contents: string })[] = []
      const validEntries: KmlLayerIndexEntry[] = []

      for (const entry of kmlIndex) {
        try {
          const contents = await fs.promises.readFile(
            storedPathFor(entry),
            "utf8",
          )
          layers.push({ ...entry, contents })
          validEntries.push(entry)
        } catch (error) {
          console.error(`Error reading stored KML ${entry.name}:`, error)
        }
      }

      // Prune entries we could not read so the index cannot grow unbounded
      if (validEntries.length !== kmlIndex.length) {
        kmlIndex = validEntries
        saveIndex()
      }

      return layers
    },

    deleteKmlFile(id: string): boolean {
      const entry = kmlIndex.find((item) => item.id === id)
      if (!entry) return false

      try {
        fs.unlinkSync(storedPathFor(entry))
      } catch {
        // File already gone
      }

      kmlIndex = kmlIndex.filter((item) => item.id !== id)
      saveIndex()

      return true
    },
  }
}
