// Patches the local Electron.app bundle so that macOS shows "c8c" in the dock
// and menu bar during development. Runs automatically via postinstall.

const fs = require("fs")
const path = require("path")

const APP_NAME = "c8c"
const electronApp = path.join(
  __dirname,
  "..",
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
)
const contentsDir = path.join(electronApp, "Contents")
const plistPath = path.join(contentsDir, "Info.plist")
const oldBinary = path.join(contentsDir, "MacOS", "Electron")
const newBinary = path.join(contentsDir, "MacOS", APP_NAME)

try {
  // 1. Patch Info.plist — replace all "Electron" strings with app name
  let plist = fs.readFileSync(plistPath, "utf8")
  plist = plist.replace(
    /<string>Electron<\/string>/g,
    `<string>${APP_NAME}</string>`,
  )
  fs.writeFileSync(plistPath, plist)

  // 2. Rename binary + symlink old name so electron-vite still finds it
  if (fs.existsSync(oldBinary) && !fs.lstatSync(oldBinary).isSymbolicLink()) {
    fs.renameSync(oldBinary, newBinary)
    fs.symlinkSync(APP_NAME, oldBinary)
  }

  console.log(`[patch-electron-name] Electron.app patched → "${APP_NAME}"`)
} catch (err) {
  // Non-fatal — dev still works, just shows "Electron" in dock
  console.warn("[patch-electron-name] skipped:", err.message)
}
