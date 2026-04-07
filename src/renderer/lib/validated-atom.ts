import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator,
} from "jotai/utils"

/**
 * Like `atomWithStorage`, but validates values read from localStorage.
 *
 * When the stored value fails validation (corrupt JSON, schema mismatch),
 * the atom silently returns `defaultValue` instead of crashing.
 */
export function validatedAtomWithStorage<T>(
  key: string,
  defaultValue: T,
  validate: (value: unknown) => value is T,
) {
  const storage = unstable_withStorageValidator(validate)(
    createJSONStorage<unknown>(),
  )
  return atomWithStorage<T>(key, defaultValue, storage, { getOnInit: true })
}
