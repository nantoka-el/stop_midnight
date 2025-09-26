import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { app, ensureAuth } from './firebase'
import type { NightPlan, NightRecord, NightReview, RatingSymbol, UserSettings } from './types'

const db = getFirestore(app)
const COLLECTION = 'nightLogs'
const SETTINGS_COLLECTION = 'userSettings'

const POSITIVE_SYMBOLS: RatingSymbol[] = ['◎', '○']

function dateKeyToDocId(dateKey: string): string {
  return dateKey.replace(/\//g, '-')
}

function docIdToDateKey(docId: string): string {
  return docId.replace(/-/g, '/')
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return `${y}/${m}/${d} ${time}`
}

function resolveTimestamp(data: { clientUpdatedAt?: string; updatedAt?: Timestamp }): string {
  if (data.clientUpdatedAt) {
    return data.clientUpdatedAt
  }
  if (data.updatedAt instanceof Timestamp) {
    return formatTimestamp(data.updatedAt.toDate())
  }
  return ''
}

export async function fetchNightLogs(): Promise<Record<string, NightRecord>> {
  await ensureAuth()
  const snapshot = await getDocs(collection(db, COLLECTION))
  const records: Record<string, NightRecord> = {}

  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    const dateKey = docIdToDateKey(docSnap.id)
    const record: NightRecord = {
      streak: typeof data.streak === 'number' ? data.streak : 0,
    }

    if (data.plan?.text) {
      record.plan = {
        text: data.plan.text,
        updatedAt: resolveTimestamp(data.plan),
      }
    }

    if (data.review?.rating) {
      const rating = data.review.rating as RatingSymbol
      record.review = {
        text: data.review.text ?? '',
        rating,
        mood: typeof data.review.mood === 'number' ? data.review.mood : 0,
        avoided: Array.isArray(data.review.avoided) ? data.review.avoided : [],
        updatedAt: resolveTimestamp(data.review),
      }
    }

    records[dateKey] = record
  })

  return records
}

export async function saveNightPlan(dateKey: string, plan: NightPlan, avoidanceGoals: string[]): Promise<void> {
  await ensureAuth()
  const docRef = doc(db, COLLECTION, dateKeyToDocId(dateKey))
  await setDoc(
    docRef,
    {
      avoidanceGoals,
      plan: {
        text: plan.text,
        clientUpdatedAt: plan.updatedAt,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function saveNightReview(dateKey: string, review: NightReview, streak: number): Promise<void> {
  await ensureAuth()
  const docRef = doc(db, COLLECTION, dateKeyToDocId(dateKey))
  await setDoc(
    docRef,
    {
      streak,
      review: {
        text: review.text,
        rating: review.rating,
        mood: review.mood,
        avoided: review.avoided,
        clientUpdatedAt: review.updatedAt,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function isPositiveReview(record: NightRecord | undefined): boolean {
  if (!record?.review) return false
  return POSITIVE_SYMBOLS.includes(record.review.rating)
}

export async function deleteNightLog(dateKey: string): Promise<void> {
  await ensureAuth()
  const docRef = doc(db, COLLECTION, dateKeyToDocId(dateKey))
  await deleteDoc(docRef)
}

export async function fetchUserSettings(): Promise<Partial<UserSettings>> {
  const uid = await ensureAuth()
  const docRef = doc(db, SETTINGS_COLLECTION, uid)
  const snapshot = await getDoc(docRef)
  if (!snapshot.exists()) {
    return {}
  }
  const data = snapshot.data() ?? {}
  const partial: Partial<UserSettings> = {}
  if (typeof data.displayName === 'string') {
    partial.displayName = data.displayName
  }
  if (Array.isArray(data.avoidanceGoals)) {
    partial.avoidanceGoals = data.avoidanceGoals.filter((item): item is string => typeof item === 'string')
  }
  if (typeof data.plannerLabel === 'string') {
    partial.plannerLabel = data.plannerLabel
  }
  const timeslot = data.plannerPromptTimeslot
  if (timeslot && typeof timeslot === 'object') {
    const start = typeof timeslot.start === 'string' ? timeslot.start : undefined
    const end = typeof timeslot.end === 'string' ? timeslot.end : undefined
    const randomize = typeof timeslot.randomize === 'boolean' ? timeslot.randomize : undefined
    if (start && end && randomize !== undefined) {
      partial.plannerPromptTimeslot = { start, end, randomize }
    }
  }
  if (typeof data.reviewPromptTime === 'string') {
    partial.reviewPromptTime = data.reviewPromptTime
  }
  const motivation = data.motivationReminder
  if (motivation && typeof motivation === 'object') {
    const time = typeof motivation.time === 'string' ? motivation.time : undefined
    const enabled = typeof motivation.enabled === 'boolean' ? motivation.enabled : undefined
    if (time && enabled !== undefined) {
      partial.motivationReminder = { time, enabled }
    }
  }
  if (typeof data.passcodeEnabled === 'boolean') {
    partial.passcodeEnabled = data.passcodeEnabled
  }
  return partial
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const uid = await ensureAuth()
  const docRef = doc(db, SETTINGS_COLLECTION, uid)
  await setDoc(
    docRef,
    {
      displayName: settings.displayName,
      avoidanceGoals: settings.avoidanceGoals,
      plannerLabel: settings.plannerLabel,
      plannerPromptTimeslot: settings.plannerPromptTimeslot,
      reviewPromptTime: settings.reviewPromptTime,
      motivationReminder: settings.motivationReminder,
      passcodeEnabled: settings.passcodeEnabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
