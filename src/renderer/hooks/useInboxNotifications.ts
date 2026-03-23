import { useCallback, useMemo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  addInboxNotificationAtom,
  clearInboxNotificationsAtom,
  removeInboxNotificationsByPersistentKeysAtom,
  markAllInboxNotificationsReadAtom,
  markInboxNotificationReadAtom,
  unreadInboxCountAtom,
  type CreateInboxNotification,
} from "@/lib/store"

export function useInboxNotifications() {
  const unreadCount = useAtomValue(unreadInboxCountAtom)
  const addInboxNotification = useSetAtom(addInboxNotificationAtom)
  const removeNotificationsByPersistentKeys = useSetAtom(
    removeInboxNotificationsByPersistentKeysAtom,
  )
  const markRead = useSetAtom(markInboxNotificationReadAtom)
  const markAllRead = useSetAtom(markAllInboxNotificationsReadAtom)
  const clearAll = useSetAtom(clearInboxNotificationsAtom)
  const addNotification = useCallback(
    // Consumers use this in effect dependencies, so its identity must stay stable.
    (notification: CreateInboxNotification) =>
      addInboxNotification(notification),
    [addInboxNotification],
  )
  const removeByPersistentKeys = useCallback(
    (persistentKeys: readonly string[]) =>
      removeNotificationsByPersistentKeys(persistentKeys),
    [removeNotificationsByPersistentKeys],
  )

  return useMemo(
    () => ({
      unreadCount,
      addNotification,
      removeByPersistentKeys,
      markRead,
      markAllRead,
      clearAll,
    }),
    [
      unreadCount,
      addNotification,
      removeByPersistentKeys,
      markRead,
      markAllRead,
      clearAll,
    ],
  )
}
