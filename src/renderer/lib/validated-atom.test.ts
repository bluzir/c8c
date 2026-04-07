// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { createStore } from "jotai"
import { validatedAtomWithStorage } from "./validated-atom"

// Simple validator: object with { model: string, maxTurns: number }
interface TestConfig {
  model: string
  maxTurns: number
}

function isTestConfig(v: unknown): v is TestConfig {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as TestConfig).model === "string" &&
    typeof (v as TestConfig).maxTurns === "number"
  )
}

const TEST_KEY = "test:validated-atom"
const DEFAULT_VALUE: TestConfig = { model: "sonnet", maxTurns: 40 }

beforeEach(() => {
  localStorage.removeItem(TEST_KEY)
})

describe("validatedAtomWithStorage", () => {
  it("returns default when localStorage has corrupt JSON", () => {
    localStorage.setItem(TEST_KEY, "{not valid json!!")
    const testAtom = validatedAtomWithStorage(
      TEST_KEY,
      DEFAULT_VALUE,
      isTestConfig,
    )
    const store = createStore()
    expect(store.get(testAtom)).toEqual(DEFAULT_VALUE)
  })

  it("returns default when value doesn't match schema", () => {
    // Valid JSON but wrong shape (maxTurns is a string, not number)
    localStorage.setItem(
      TEST_KEY,
      JSON.stringify({ model: "opus", maxTurns: "not-a-number" }),
    )
    const testAtom = validatedAtomWithStorage(
      TEST_KEY,
      DEFAULT_VALUE,
      isTestConfig,
    )
    const store = createStore()
    expect(store.get(testAtom)).toEqual(DEFAULT_VALUE)
  })

  it("returns parsed value when schema matches", () => {
    const stored: TestConfig = { model: "opus", maxTurns: 120 }
    localStorage.setItem(TEST_KEY, JSON.stringify(stored))
    const testAtom = validatedAtomWithStorage(
      TEST_KEY,
      DEFAULT_VALUE,
      isTestConfig,
    )
    const store = createStore()
    expect(store.get(testAtom)).toEqual(stored)
  })

  it("works with atomWithStorage read/write cycle", () => {
    const testAtom = validatedAtomWithStorage(
      TEST_KEY,
      DEFAULT_VALUE,
      isTestConfig,
    )
    const store = createStore()

    // Initial read
    expect(store.get(testAtom)).toEqual(DEFAULT_VALUE)

    // Write a valid value
    const newValue: TestConfig = { model: "haiku", maxTurns: 10 }
    store.set(testAtom, newValue)
    expect(store.get(testAtom)).toEqual(newValue)

    // Verify it persisted to localStorage
    expect(JSON.parse(localStorage.getItem(TEST_KEY)!)).toEqual(newValue)
  })
})
