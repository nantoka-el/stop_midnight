import './style.css'
import { getToken, onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from './firebase'
import { deleteNightLog, fetchNightLogs, fetchUserSettings, isPositiveReview, saveNightPlan, saveNightReview, savePlannerChips, saveUserSettings } from './firestore'
import type { AppState, NightRecord, ReviewRating, UserSettings } from './types'

import type { RatingSymbol } from './types'

const PLAN_PLACEHOLDERS = [
  '読書20分＋日記で頭を整える',
  '夜食の代わりにハーブティーを淹れる',
  'スマホはリビングに置いてストレッチ15分',
  '明日の準備と簡単な片付けで締めくくる',
  '軽いヨガと深呼吸で体をリセットする',
]

const DEFAULT_ARIGATEE_MESSAGES = [
  '夜が楽しくても、明日の自分が困らないようにね。',
  '欲望に引っ張られそうになったら、ゆっくり深呼吸。',
  '眠る前の30分だけ、未来の自分のために使ってみよう。',
  '闇カジノより、静かな時間の方が強い。今日もそれを証明しよう。',
  '深酒は簡単、でも早起きはもっと気持ちいい。',
]

const initialRecords: Record<string, NightRecord> = {}

const defaultSettings: UserSettings = {
  displayName: 'りんね',
  avoidanceGoals: ['闇カジノ', '夜食'],
  plannerLabel: '今夜は何をする？',
  plannerPromptTimeslot: { start: '22:00', end: '23:00', randomize: true },
  reviewPromptTime: '04:00',
  motivationReminder: { time: '21:00', enabled: true },
  gratitudeMessages: [...DEFAULT_ARIGATEE_MESSAGES],
  plannerChips: [],
  passcodeEnabled: false,
}

const state: AppState = {
  ...defaultSettings,
  streak: 0,
  todayDate: new Date(),
  todayPlan: {
    text: '',
    chips: [],
    customChips: [...defaultSettings.plannerChips],
  },
  review: {
    pending: true,
    rating: null,
    notes: '',
    avoided: [],
    mood: 4,
  },
  achievements: [
    { id: 'streak-3', title: '3日連続達成！', description: '連続3日間、悪癖を回避できた', icon: '🏅', unlocked: true, progress: 3, goal: 3, category: 'streak' },
    { id: 'streak-7', title: '月光ランナー', description: '7日連続で悪癖を回避しよう', icon: '🌙', unlocked: false, progress: 3, goal: 7, category: 'streak' },
    { id: 'habit-avoid-10', title: '誘惑バスター', description: '夜の誘惑を10回回避しよう', icon: '🛡️', unlocked: false, progress: 6, goal: 10, category: 'habit' },
    { id: 'recovery-1', title: 'リカバリー成功', description: '連続達成が途切れた翌日に立て直す', icon: '🔄', unlocked: false, progress: 0, goal: 1, category: 'recovery' },
  ],
  gratitudeMessages: [...DEFAULT_ARIGATEE_MESSAGES],
  currentGratitude: DEFAULT_ARIGATEE_MESSAGES[0],
  currentGratitudeIndex: 0,
  records: initialRecords,
  plannerChips: [...defaultSettings.plannerChips],
}

loadSelectedDate(state.todayDate)

function mergeUserSettings(partial: Partial<UserSettings>): UserSettings {
  return {
    displayName: partial.displayName ?? defaultSettings.displayName,
    avoidanceGoals: partial.avoidanceGoals && partial.avoidanceGoals.length > 0 ? partial.avoidanceGoals : defaultSettings.avoidanceGoals,
    plannerLabel: partial.plannerLabel ?? defaultSettings.plannerLabel,
    plannerPromptTimeslot: {
      start: partial.plannerPromptTimeslot?.start ?? defaultSettings.plannerPromptTimeslot.start,
      end: partial.plannerPromptTimeslot?.end ?? defaultSettings.plannerPromptTimeslot.end,
      randomize: partial.plannerPromptTimeslot?.randomize ?? defaultSettings.plannerPromptTimeslot.randomize,
    },
    reviewPromptTime: partial.reviewPromptTime ?? defaultSettings.reviewPromptTime,
    motivationReminder: {
      time: partial.motivationReminder?.time ?? defaultSettings.motivationReminder.time,
      enabled: partial.motivationReminder?.enabled ?? defaultSettings.motivationReminder.enabled,
    },
    gratitudeMessages: partial.gratitudeMessages && partial.gratitudeMessages.length > 0
      ? partial.gratitudeMessages
      : defaultSettings.gratitudeMessages,
    plannerChips: partial.plannerChips && partial.plannerChips.length > 0
      ? partial.plannerChips
      : defaultSettings.plannerChips,
    passcodeEnabled: partial.passcodeEnabled ?? defaultSettings.passcodeEnabled,
  }
}

function applySettings(settings: UserSettings) {
  state.displayName = settings.displayName
  state.avoidanceGoals = [...settings.avoidanceGoals]
  state.plannerLabel = settings.plannerLabel
  state.plannerPromptTimeslot = { ...settings.plannerPromptTimeslot }
  state.reviewPromptTime = settings.reviewPromptTime
  state.motivationReminder = { ...settings.motivationReminder }
  state.gratitudeMessages = [...settings.gratitudeMessages]
  state.todayPlan.customChips = [...settings.plannerChips]
  state.plannerChips = [...settings.plannerChips]
  state.passcodeEnabled = settings.passcodeEnabled
}

function qs<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element as T
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}/${m}/${d}`
}

function formatDateKey(date: Date): string {
  return formatDate(date)
}

function formatTimestamp(date: Date): string {
  return `${formatDate(date)} ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
}

function parseTimestamp(value: string): Date | undefined {
  const isoCandidate = value.replace(' ', 'T')
  const parsed = new Date(isoCandidate)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getMonday(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  const diff = (day + 6) % 7
  result.setDate(result.getDate() - diff)
  result.setHours(0, 0, 0, 0)
  return result
}

function formatWeekdayShort(date: Date): string {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return weekdays[date.getDay()]
}

function formatFullDateTime(date: Date, reference: Date): string {
  const month = `${date.getMonth() + 1}`
  const day = `${date.getDate()}`
  const weekday = formatWeekdayShort(date)
  const hours = `${reference.getHours()}`.padStart(2, '0')
  const minutes = `${reference.getMinutes()}`.padStart(2, '0')
  return `${month}/${day} (${weekday}) ${hours}:${minutes}`
}

let openingTypingTimer: number | undefined
let openingHideTimer: number | undefined
let gratitudeAnimation: Animation | null = null

function updateDateTimeDisplay() {
  const now = new Date()
  const label = formatFullDateTime(state.todayDate, now)
  todayInfo.textContent = label
  if (currentTab === 'today') {
    headerTime.textContent = label
  }
}

function getArigateWordPool(): string[] {
  const pool = state.gratitudeMessages.length > 0 ? state.gratitudeMessages : DEFAULT_ARIGATEE_MESSAGES
  return pool.length > 0 ? pool : DEFAULT_ARIGATEE_MESSAGES
}

function normalizeGratitudeIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

type GratitudeDirection = 'next' | 'prev' | 'random'

function applyGratitudeMessage(index: number, direction: GratitudeDirection = 'random'): string {
  const pool = getArigateWordPool()
  const normalizedIndex = normalizeGratitudeIndex(index, pool.length)
  const message = pool[normalizedIndex] ?? ''
  state.currentGratitudeIndex = normalizedIndex
  state.currentGratitude = message
  gratitudeMessageEl.textContent = message
  const translate = direction === 'next' ? -12 : direction === 'prev' ? 12 : 0
  if (typeof gratitudeMessageEl.animate === 'function') {
    if (gratitudeAnimation) {
      gratitudeAnimation.cancel()
    }
    gratitudeAnimation = gratitudeMessageEl.animate(
      [
        { opacity: 0, transform: `translateX(${translate}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 220, easing: 'ease-out' },
    )
    gratitudeAnimation.addEventListener('finish', () => {
      gratitudeAnimation = null
    })
    gratitudeAnimation.addEventListener('cancel', () => {
      gratitudeAnimation = null
    })
  }
  return message
}

function pickRandomGratitudeIndex(excludeIndex: number | null): number {
  const pool = getArigateWordPool()
  if (pool.length <= 1) return 0
  let index = Math.floor(Math.random() * pool.length)
  if (excludeIndex !== null && pool.length > 1) {
    while (index === excludeIndex) {
      index = Math.floor(Math.random() * pool.length)
    }
  }
  return index
}

function createOpeningGradient(): string {
  const baseHue = Math.floor(Math.random() * 360)
  const secondaryHue = (baseHue + 25 + Math.floor(Math.random() * 80)) % 360
  const saturation = 68 + Math.random() * 18
  const lightnessStart = 24 + Math.random() * 10
  const lightnessEnd = 18 + Math.random() * 12
  return `linear-gradient(135deg, hsl(${baseHue} ${saturation}% ${lightnessStart}%), hsl(${secondaryHue} ${Math.min(saturation + 6, 90)}% ${lightnessEnd}%))`
}

function showOpeningScreen(message: string) {
  hideOpeningScreen()
  openingScreen.style.background = createOpeningGradient()
  openingScreen.classList.remove('hidden')
  openingScreen.setAttribute('aria-hidden', 'false')
  openingText.textContent = ''
  const chars = Array.from(message)
  if (chars.length === 0) {
    openingHideTimer = window.setTimeout(() => hideOpeningScreen(), 500)
    return
  }
  let index = 0
  const intervalMs = 84 // 約12文字/秒（従来比3倍）
  openingTypingTimer = window.setInterval(() => {
    openingText.textContent += chars[index]
    index += 1
    if (index >= chars.length) {
      if (openingTypingTimer !== undefined) {
        window.clearInterval(openingTypingTimer)
        openingTypingTimer = undefined
      }
      openingHideTimer = window.setTimeout(() => hideOpeningScreen(), 2000)
    }
  }, intervalMs)
}

function hideOpeningScreen() {
  if (openingTypingTimer !== undefined) {
    window.clearInterval(openingTypingTimer)
    openingTypingTimer = undefined
  }
  if (openingHideTimer !== undefined) {
    window.clearTimeout(openingHideTimer)
    openingHideTimer = undefined
  }
  openingScreen.classList.add('hidden')
  openingScreen.setAttribute('aria-hidden', 'true')
  openingScreen.style.background = ''
}

type GratitudeRefreshOptions = {
  showOpening?: boolean
  method?: 'random' | 'next' | 'prev'
  index?: number
}

function refreshGratitudeMessage(options: GratitudeRefreshOptions = {}) {
  const pool = getArigateWordPool()
  if (pool.length === 0) {
    gratitudeMessageEl.textContent = ''
    state.currentGratitude = ''
    state.currentGratitudeIndex = 0
    return
  }

  let nextIndex = state.currentGratitudeIndex ?? 0
  let direction: GratitudeDirection = 'random'

  if (typeof options.index === 'number') {
    nextIndex = options.index
  } else if (options.method === 'next') {
    nextIndex = state.currentGratitudeIndex + 1
    direction = 'next'
  } else if (options.method === 'prev') {
    nextIndex = state.currentGratitudeIndex - 1
    direction = 'prev'
  } else if (options.method === 'random' || options.showOpening || state.currentGratitude === '') {
    nextIndex = pickRandomGratitudeIndex(pool.length > 1 ? state.currentGratitudeIndex : null)
    direction = 'random'
  }

  const message = applyGratitudeMessage(nextIndex, direction)
  if (options.showOpening) {
    showOpeningScreen(message)
  }
}

function refreshTodayView() {
  updateDateTimeDisplay()
  renderAchievements()
}

function getRecord(dateKey: string, create = false): NightRecord | undefined {
  let record = state.records[dateKey]
  if (!record && create) {
    record = { streak: 0 }
    state.records[dateKey] = record
  }
  return record
}

function parseDateKeyToDate(key: string): Date {
  const parts = key.split('/')
  if (parts.length !== 3) {
    return new Date(Number.NaN)
  }
  const [yearStr, monthStr, dayStr] = parts
  const year = Number.parseInt(yearStr, 10)
  const month = Number.parseInt(monthStr, 10)
  const day = Number.parseInt(dayStr, 10)
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return new Date(Number.NaN)
  }
  const date = new Date(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

function computeCurrentStreak(records: Record<string, NightRecord>): number {
  const keys = Object.keys(records).sort()
  if (keys.length === 0) return 0

  let streak = 0
  let previousDate: Date | null = null

  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i]
    const record = records[key]
    if (!isPositiveReview(record)) {
      break
    }

    const currentDate = parseDateKeyToDate(key)
    if (previousDate) {
      const diffMs = previousDate.getTime() - currentDate.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays !== 1) {
        break
      }
    }

    streak += 1
    previousDate = currentDate
  }

  return streak
}

function loadSelectedDate(date: Date) {
  state.todayDate = date
  const key = formatDateKey(date)
  const record = getRecord(key)
  if (record?.plan) {
    state.todayPlan.text = record.plan.text
  } else {
    state.todayPlan.text = ''
  }

  if (record?.review) {
    state.review.pending = false
    state.review.notes = record.review.text
    state.review.rating = deriveRatingFromSymbol(record.review.rating)
    state.review.mood = record.review.mood
    state.review.avoided = [...record.review.avoided]
    const parsedTs = parseTimestamp(record.review.updatedAt)
    state.review.reviewTimestamp = parsedTs
  } else {
    state.review.pending = true
    state.review.notes = ''
    state.review.rating = null
    state.review.mood = 4
    state.review.avoided = []
    state.review.reviewTimestamp = undefined
  }
}

function deriveRatingFromSymbol(symbol: RatingSymbol | null): ReviewRating | null {
  switch (symbol) {
    case '◎':
      return 'great'
    case '○':
      return 'good'
    case '△':
      return 'ok'
    case '✕':
      return 'bad'
    default:
      return null
  }
}

const appRoot = qs<HTMLDivElement>('#app')

appRoot.innerHTML = `
  <div class="app-overlay hidden" id="opening-screen" aria-hidden="true">
    <div class="opening-content">
      <span id="opening-text"></span>
    </div>
  </div>
  <main class="app-shell">
    <header class="app-header">
      <h1 id="header-title">Stop Midnight</h1>
      <div class="header-meta">
        <span id="header-time" class="header-time"></span>
      </div>
      <p id="gratitude-message" class="gratitude-message"></p>
    </header>

    <section id="today-view" class="tab-view active">
      <div class="today-card" id="planner-card">
        <div class="today-header">
          <div class="today-header__datetime" id="today-info">--</div>
          <div class="today-header__streak" id="today-streak"></div>
          <div class="badges" id="avoidance-badges"></div>
        </div>
        <label class="field">
          <span id="planner-label">今夜は何をする？</span>
          <textarea id="planner-text" rows="6" placeholder=""></textarea>
        </label>
        <div class="chips" id="preset-chips"></div>
        <div class="chip-input">
          <input type="text" id="chip-input" placeholder="よく使う項目">
          <button type="button" id="chip-add">＋追加</button>
        </div>
        <label class="toggle">
          <input type="checkbox" id="reminder-toggle" checked>
          <span>翌朝のフィードバック通知を受け取る</span>
        </label>
        <div class="today-actions">
          <button id="planner-save" class="primary">計画を確定する</button>
          <button id="switch-to-review" class="ghost">レビュー状態を見る</button>
        </div>
      </div>

      <div class="today-card hidden" id="review-card">
        <div class="today-meta">
          <div id="review-night-label">対象夜: --</div>
          <div class="previous-plan" id="previous-plan"></div>
          <div class="review-info" id="review-meta-info"></div>
        </div>
        <div class="rating-group" id="rating-group">
          <button data-rating="great">◎</button>
          <button data-rating="good">○</button>
          <button data-rating="ok">△</button>
          <button data-rating="bad">✕</button>
        </div>
        <label class="field">
          <span>今夜はどうだった？</span>
          <textarea id="review-text" rows="3" placeholder="自由に振り返りを書いてください"></textarea>
        </label>
        <div class="checkbox-list" id="avoidance-checks"></div>
        <label class="field">
          <span>気分メーター</span>
          <input type="range" id="mood-slider" min="1" max="5" value="4">
          <div class="mood-indicator">現在: <span id="mood-value">4</span></div>
        </label>
        <div class="today-actions">
          <button id="review-save" class="primary">レビューを保存</button>
          <button id="switch-to-plan" class="ghost">プランニングに戻る</button>
        </div>
      </div>

      <div class="today-footer" id="today-footer">
        <div class="achievement-strip" id="achievement-strip"></div>
        <div class="next-target" id="next-target"></div>
      </div>
    </section>

    <section id="calendar-view" class="tab-view hidden">
      <div class="calendar-weekdays">
        <span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span>
      </div>
      <div class="calendar-grid" id="calendar-grid"></div>
    </section>

    <section id="setting-view" class="tab-view hidden">
      <form id="setting-form" class="settings-form">
        <label class="field">
          <span>名前（呼び名）</span>
          <input type="text" id="setting-name" required>
        </label>
        <label class="field">
          <span>やめたいこと（カンマ区切り）</span>
          <input type="text" id="setting-goals" placeholder="闇カジノ, 夜食">
        </label>
        <label class="field">
          <span>Plannerで聞く文言</span>
          <input type="text" id="setting-planner-label" placeholder="今夜は何をする？">
        </label>
        <div class="field-grid">
          <label class="field">
            <span>プラン通知（開始〜終了）</span>
            <input type="time" id="setting-plan-start" value="22:00">
            <input type="time" id="setting-plan-end" value="23:00">
          </label>
          <label class="field">
            <span>振り返り通知</span>
            <input type="time" id="setting-review-time" value="04:00">
          </label>
          <label class="field">
            <span>モチベーションリマインド</span>
            <input type="time" id="setting-motivation-time" value="21:00">
          </label>
        </div>
        <label class="field">
          <span>ありがてえ言葉（改行ごとに1つ、最大60行）</span>
          <textarea id="setting-gratitude" rows="7" placeholder="賢い時の自分から夜の自分へ伝えたい言葉"></textarea>
        </label>
        <label class="toggle">
          <input type="checkbox" id="setting-passcode">
          <span>パスコードロックを有効にする</span>
        </label>
        <div class="settings-actions">
          <button type="submit" class="primary">保存</button>
          <button type="button" id="setting-reset" class="ghost">リセット</button>
        </div>
        <div class="settings-message" id="settings-message"></div>
      </form>
      <section class="push-setup" id="push-setup" data-support="unknown">
        <h3 class="push-setup__title">プッシュ通知</h3>
        <p class="push-setup__status">状態: <span id="push-status">未登録</span></p>
        <div class="push-setup__actions">
          <button type="button" id="push-request-permission" class="primary">通知を有効にする</button>
          <button type="button" id="push-send-test" class="ghost small" disabled>テスト通知を送る</button>
        </div>
        <p class="push-setup__note">※ iOS のホーム画面追加端末は Apple Developer Program 登録後に有効化します。</p>
      </section>
    </section>
  </main>

  <nav class="tab-bar">
    <button class="tab-bar__item active" data-tab="today">
      <span class="icon">🌙</span>
      <span class="label">TODAY</span>
    </button>
    <button class="tab-bar__item" data-tab="calendar">
      <span class="icon">📅</span>
      <span class="label">Calendar</span>
    </button>
    <button class="tab-bar__item" data-tab="setting">
      <span class="icon">⚙️</span>
      <span class="label">Setting</span>
    </button>
  </nav>

  <div class="modal hidden" id="calendar-modal">
    <div class="modal-content">
      <div class="modal-ribbon" id="modal-ribbon">連続達成</div>
      <button class="modal-close" id="modal-close">×</button>
      <h2 id="modal-date"></h2>
      <p class="modal-streak"><strong>連続達成</strong><span id="modal-streak"></span></p>
      <p class="modal-plan"><strong>PLAN</strong><span id="modal-plan"></span></p>
      <p class="modal-review"><strong>REVIEW</strong><span id="modal-review"></span></p>
      <p class="modal-meta" id="modal-meta"></p>
      <div class="modal-actions">
        <button type="button" id="modal-edit-plan" class="ghost">計画を編集</button>
        <button type="button" id="modal-edit-review" class="ghost">レビューを編集</button>
        <button type="button" id="modal-delete" class="ghost danger">削除する</button>
      </div>
    </div>
  </div>
`

const headerTitle = qs<HTMLHeadingElement>('#header-title')
const headerTime = qs<HTMLSpanElement>('#header-time')
const gratitudeMessageEl = qs<HTMLParagraphElement>('#gratitude-message')
const openingScreen = qs<HTMLDivElement>('#opening-screen')
const openingText = qs<HTMLSpanElement>('#opening-text')
const plannerCard = qs<HTMLDivElement>('#planner-card')
const reviewCard = qs<HTMLDivElement>('#review-card')
const plannerLabel = qs<HTMLSpanElement>('#planner-label')
const plannerText = qs<HTMLTextAreaElement>('#planner-text')
const presetChips = qs<HTMLDivElement>('#preset-chips')
const chipInput = qs<HTMLInputElement>('#chip-input')
const reminderToggle = qs<HTMLInputElement>('#reminder-toggle')
const badgesWrap = qs<HTMLDivElement>('#avoidance-badges')
const todayInfo = qs<HTMLDivElement>('#today-info')
const todayStreak = qs<HTMLDivElement>('#today-streak')
const achievementStrip = qs<HTMLDivElement>('#achievement-strip')
const nextTargetMessage = qs<HTMLDivElement>('#next-target')
const todayFooter = qs<HTMLDivElement>('#today-footer')
const reviewNightLabel = qs<HTMLDivElement>('#review-night-label')
const previousPlanEl = qs<HTMLDivElement>('#previous-plan')
const reviewMetaInfo = qs<HTMLDivElement>('#review-meta-info')
const reviewText = qs<HTMLTextAreaElement>('#review-text')
const moodSlider = qs<HTMLInputElement>('#mood-slider')
const moodValue = qs<HTMLSpanElement>('#mood-value')
const avoidanceChecks = qs<HTMLDivElement>('#avoidance-checks')
const ratingButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#rating-group button'))
const calendarGrid = qs<HTMLDivElement>('#calendar-grid')
const modal = qs<HTMLDivElement>('#calendar-modal')
const modalRibbon = qs<HTMLDivElement>('#modal-ribbon')
const modalDate = qs<HTMLHeadingElement>('#modal-date')
const modalStreak = qs<HTMLSpanElement>('#modal-streak')
const modalPlan = qs<HTMLSpanElement>('#modal-plan')
const modalReview = qs<HTMLSpanElement>('#modal-review')
const modalMeta = qs<HTMLParagraphElement>('#modal-meta')
const modalEditPlan = qs<HTMLButtonElement>('#modal-edit-plan')
const modalEditReview = qs<HTMLButtonElement>('#modal-edit-review')
const modalDelete = qs<HTMLButtonElement>('#modal-delete')
const settingForm = qs<HTMLFormElement>('#setting-form')
const settingName = qs<HTMLInputElement>('#setting-name')
const settingGoals = qs<HTMLInputElement>('#setting-goals')
const settingPlannerLabel = qs<HTMLInputElement>('#setting-planner-label')
const settingPlanStart = qs<HTMLInputElement>('#setting-plan-start')
const settingPlanEnd = qs<HTMLInputElement>('#setting-plan-end')
const settingReviewTime = qs<HTMLInputElement>('#setting-review-time')
const settingMotivationTime = qs<HTMLInputElement>('#setting-motivation-time')
const settingGratitude = qs<HTMLTextAreaElement>('#setting-gratitude')
const settingPasscode = qs<HTMLInputElement>('#setting-passcode')
const settingsMessage = qs<HTMLDivElement>('#settings-message')
const pushSetup = qs<HTMLDivElement>('#push-setup')
const pushStatus = qs<HTMLSpanElement>('#push-status')
const pushRequestButton = qs<HTMLButtonElement>('#push-request-permission')
const pushTestButton = qs<HTMLButtonElement>('#push-send-test')


let currentTodayView: 'plan' | 'review' = 'plan'
let currentTab: 'today' | 'calendar' | 'setting' = 'today'
let cachedPushToken: string | null = null

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL ?? 'https://asia-northeast1-stop-midnight.cloudfunctions.net'
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

headerTitle.textContent = 'Stop Midnight'

function updateHeaderForTab(tab: 'today' | 'calendar' | 'setting') {
  if (tab === 'calendar') {
    headerTime.textContent = 'Calendar'
  } else if (tab === 'setting') {
    headerTime.textContent = 'Setting'
  } else {
    updateDateTimeDisplay()
  }
}

function populateSettingsForm() {
  settingName.value = state.displayName
  settingGoals.value = state.avoidanceGoals.join(', ')
  settingPlannerLabel.value = state.plannerLabel
  settingPlanStart.value = state.plannerPromptTimeslot.start
  settingPlanEnd.value = state.plannerPromptTimeslot.end
  settingReviewTime.value = state.reviewPromptTime
  settingMotivationTime.value = state.motivationReminder.time
  settingGratitude.value = state.gratitudeMessages.join('\n')
  settingPasscode.checked = state.passcodeEnabled
}

function renderAchievements() {
  todayFooter.classList.add('hidden')
  achievementStrip.innerHTML = ''
  nextTargetMessage.textContent = ''
}

function setPlannerPlaceholder() {
  if (state.todayPlan.text.trim().length > 0) {
    plannerText.placeholder = ''
    return
  }
  const sample = PLAN_PLACEHOLDERS[Math.floor(Math.random() * PLAN_PLACEHOLDERS.length)]
  plannerText.placeholder = sample
}

function createChipElement(label: string, { removable }: { removable: boolean }): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'chip'
  button.textContent = label
  const appendChip = () => {
    const existing = plannerText.value
    const needsNewline = existing.trim().length > 0
    plannerText.value = needsNewline ? `${existing}\n${label}` : label
  }
  let longPressTimer: number | undefined
  const clearTimer = () => {
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer)
      longPressTimer = undefined
    }
  }
  const handleRemoval = () => {
    if (!removable) return
    if (window.confirm(`"${label}" を削除しますか？`)) {
      button.dataset.removing = 'true'
      clearTimer()
      state.todayPlan.customChips = state.todayPlan.customChips.filter((chip) => chip !== label)
      renderPlanner()
      void persistPlannerChips()
    }
  }
  button.addEventListener('click', (event) => {
    if (button.dataset.removing === 'true') {
      return
    }
    if (removable && event.altKey) {
      handleRemoval()
    } else {
      appendChip()
    }
  })
  if (removable) {
    button.addEventListener('pointerdown', () => {
      clearTimer()
      longPressTimer = window.setTimeout(() => {
        longPressTimer = undefined
        handleRemoval()
      }, 600)
    })
    button.addEventListener('pointerup', clearTimer)
    button.addEventListener('pointerleave', clearTimer)
  }
  return button
}

function renderPlanner() {
  updateDateTimeDisplay()
  badgesWrap.innerHTML = ''
  state.avoidanceGoals.forEach((goal) => {
    const badge = document.createElement('span')
    badge.className = 'badge'
    badge.textContent = goal
    badgesWrap.appendChild(badge)
  })

  plannerLabel.textContent = state.plannerLabel
  plannerText.value = state.todayPlan.text
  setPlannerPlaceholder()
  reminderToggle.checked = state.motivationReminder.enabled

  todayStreak.textContent = state.streak > 0 ? `連続${state.streak}日 継続中` : '今日から再スタート'

  renderChips()
  refreshTodayView()
}

function renderChips() {
  presetChips.innerHTML = ''
  state.todayPlan.chips.forEach((chip) => {
    const button = createChipElement(chip, { removable: false })
    presetChips.appendChild(button)
  })
  state.todayPlan.customChips.forEach((chip) => {
    const button = createChipElement(chip, { removable: true })
    button.dataset.custom = 'true'
    presetChips.appendChild(button)
  })
}

async function persistPlannerChips() {
  try {
    await savePlannerChips([...state.todayPlan.customChips])
  } catch (error) {
    console.error('利用頻度の高い項目の保存に失敗しました', error)
  }
}

function renderMoodIcons(container: HTMLDivElement, level: number) {
  container.innerHTML = ''
  const clamped = Math.max(0, Math.min(level, 5))
  container.classList.toggle('status-mood--empty', clamped === 0)
  for (let i = 1; i <= 5; i += 1) {
    const span = document.createElement('span')
    span.className = 'status-mood__dot'
    span.dataset.active = (i <= clamped).toString()
    container.appendChild(span)
  }
}

function renderReview() {
  updateDateTimeDisplay()
  const dateLabel = formatMonthDay(state.todayDate)
  todayStreak.textContent = state.streak > 0 ? `連続${state.streak}日 継続中` : '今日から再スタート'
  reviewNightLabel.textContent = `対象夜: ${dateLabel} (ログ上は ${formatDate(state.todayDate)})`
  previousPlanEl.textContent = `計画: ${state.todayPlan.text || '未入力'}`
  reviewText.value = state.review.notes
  moodSlider.value = `${state.review.mood}`
  moodValue.textContent = `${state.review.mood}`

  reviewMetaInfo.textContent = state.review.reviewTimestamp
    ? `最終保存: ${formatDate(state.review.reviewTimestamp)} ${state.review.reviewTimestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
    : 'レビュー未保存'

  avoidanceChecks.innerHTML = ''
  state.avoidanceGoals.forEach((goal) => {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = state.review.avoided.includes(goal)
    input.addEventListener('change', () => {
      if (input.checked) {
        if (!state.review.avoided.includes(goal)) {
          state.review.avoided.push(goal)
        }
      } else {
        state.review.avoided = state.review.avoided.filter((g) => g !== goal)
      }
    })
    const span = document.createElement('span')
    span.textContent = `${goal}を避けた`
    label.append(input, span)
    avoidanceChecks.appendChild(label)
  })

  ratingButtons.forEach((button) => {
    const rating = button.dataset.rating as ReviewRating | undefined
    button.classList.toggle('active', rating !== undefined && rating === state.review.rating)
  })
  refreshTodayView()
}

let activeModalDateKey: string | null = null

function renderCalendar() {
  calendarGrid.innerHTML = ''
  const entryList = Object.entries(state.records).map(([dateKey, record]) => ({
    key: dateKey,
    record,
    date: parseDateKeyToDate(dateKey),
  }))
  entryList.sort((a, b) => a.date.getTime() - b.date.getTime())

  const weeks = new Map<string, { monday: Date; items: Map<number, { key: string; record: NightRecord }> }>()

  entryList.forEach((item) => {
    const monday = getMonday(item.date)
    const weekKey = formatDate(monday)
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { monday, items: new Map() })
    }
    const normalizedWeekday = ((item.date.getDay() + 6) % 7)
    weeks.get(weekKey)!.items.set(normalizedWeekday, { key: item.key, record: item.record })
  })

  const sortedWeeks = Array.from(weeks.values()).sort((a, b) => a.monday.getTime() - b.monday.getTime())

  if (sortedWeeks.length === 0) {
    const fallbackWeek = { monday: getMonday(state.todayDate), items: new Map<number, { key: string; record: NightRecord }>() }
    sortedWeeks.push(fallbackWeek)
  }

  sortedWeeks.forEach((week) => {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const cellDate = new Date(week.monday)
      cellDate.setDate(cellDate.getDate() + weekday)
      const entry = week.items.get(weekday)
      const cell = document.createElement('div')
      cell.className = 'calendar-cell'

      const dayEl = document.createElement('div')
      dayEl.className = 'day'
      dayEl.textContent = formatMonthDay(cellDate)

      const status = document.createElement('div')
      status.className = 'status'
      const mood = document.createElement('div')
      mood.className = 'status-mood'

      if (entry) {
        const { record, key } = entry
        const moodLevel = record.review?.mood ?? 0
        cell.dataset.state = record.review ? 'recorded' : 'blank'
        cell.dataset.mood = moodLevel ? `m${moodLevel}` : 'none'
        const symbol = record.review?.rating ?? '△'
        status.textContent = symbol
        if (symbol === '◎' || symbol === '○') {
          status.classList.add('good')
        } else if (symbol === '△') {
          status.classList.add('ok')
        } else {
          status.classList.add('bad')
        }
        renderMoodIcons(mood, moodLevel)
        cell.addEventListener('click', () => openModal(key))
      } else {
        cell.dataset.state = 'empty'
        cell.dataset.mood = 'none'
        status.textContent = '—'
        mood.textContent = ''
      }

      cell.append(dayEl, status, mood)
      calendarGrid.appendChild(cell)
    }
  })
}

function openModal(dateKey: string) {
  const record = getRecord(dateKey)
  if (!record) return
  activeModalDateKey = dateKey
  modalDate.textContent = `${dateKey} の夜`
  modalStreak.textContent = record.streak > 0 ? `${record.streak}日連続達成` : '連続なし'
  modalPlan.textContent = record.plan?.text ?? '未入力'
  modalReview.textContent = record.review?.text ?? 'レビュー未記録'
  const mood = record.review?.mood ?? 0
  const reviewTime = record.review?.updatedAt ?? '未記録'
  const avoided = record.review?.avoided?.length ? record.review.avoided.join(' / ') : '---'
  const moodStars = mood ? '★'.repeat(mood) + '☆'.repeat(5 - mood) : '---'
  modalMeta.textContent = `気分: ${moodStars} / 回避: ${avoided} / 最終更新: ${reviewTime}`
  modalRibbon.dataset.active = record.streak > 0 ? 'true' : 'false'
  modal.classList.remove('hidden')
}

function closeModal() {
  modal.classList.add('hidden')
  activeModalDateKey = null
}

function switchTab(tab: 'today' | 'calendar' | 'setting') {
  document.querySelectorAll<HTMLElement>('.tab-view').forEach((view) => {
    const isActive = view.id === `${tab}-view`
    view.classList.toggle('active', isActive)
    view.classList.toggle('hidden', !isActive)
  })

  document.querySelectorAll<HTMLButtonElement>('.tab-bar__item').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab)
  })

  currentTab = tab
  if (tab === 'today') {
    if (currentTodayView === 'plan') {
      plannerCard.classList.remove('hidden')
      reviewCard.classList.add('hidden')
    } else {
      plannerCard.classList.add('hidden')
      reviewCard.classList.remove('hidden')
    }
    refreshTodayView()
  }
  updateHeaderForTab(tab)
}

function selectDateForEditing(dateKey: string, target: 'plan' | 'review') {
  const date = parseDateKeyToDate(dateKey)
  if (Number.isNaN(date.getTime())) {
    window.alert('日付の形式が正しくありません')
    return
  }
  currentTodayView = target
  loadSelectedDate(date)
  renderPlanner()
  renderReview()
  switchTab('today')
  if (target === 'plan') {
    plannerCard.classList.remove('hidden')
    reviewCard.classList.add('hidden')
    window.setTimeout(() => plannerText.focus(), 50)
  } else {
    plannerCard.classList.add('hidden')
    reviewCard.classList.remove('hidden')
    window.setTimeout(() => reviewText.focus(), 50)
  }
  refreshTodayView()
}

async function deleteNightRecord(dateKey: string) {
  const record = getRecord(dateKey)
  if (!record) return
  try {
    await deleteNightLog(dateKey)
  } catch (error) {
    console.error('記録の削除に失敗しました', error)
    window.alert('記録の削除に失敗しました')
    return
  }
  delete state.records[dateKey]
  state.streak = computeCurrentStreak(state.records)
  if (formatDateKey(state.todayDate) === dateKey) {
    loadSelectedDate(state.todayDate)
    renderPlanner()
    renderReview()
    refreshTodayView()
  }
  renderCalendar()
}

function bindTabBar() {
  document.querySelectorAll<HTMLButtonElement>('.tab-bar__item').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab as 'today' | 'calendar' | 'setting'
      switchTab(tab)
    })
  })
}

function bindGratitudeInteractions() {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0

  function resetSwipe() {
    pointerId = null
    startX = 0
    startY = 0
  }

  gratitudeMessageEl.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    try {
      gratitudeMessageEl.setPointerCapture(event.pointerId)
    } catch (error) {
      // Safariなど一部環境ではPointer Eventsの完全サポートがないため黙って無視
    }
  })

  gratitudeMessageEl.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - startX
    const deltaY = event.clientY - startY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    if (absX > 40 && absX > absY) {
      if (deltaX < 0) {
        refreshGratitudeMessage({ method: 'next' })
      } else {
        refreshGratitudeMessage({ method: 'prev' })
      }
    }
    try {
      gratitudeMessageEl.releasePointerCapture(event.pointerId)
    } catch (error) {
      // 取得に失敗した場合も特に問題はないので無視
    }
    resetSwipe()
  })

  gratitudeMessageEl.addEventListener('pointercancel', (event) => {
    if (pointerId === event.pointerId) {
      try {
        gratitudeMessageEl.releasePointerCapture(event.pointerId)
      } catch (error) {
        // 取得に失敗した場合も特に問題はないので無視
      }
    }
    resetSwipe()
  })
}

function bindTodayActions() {
  reminderToggle.addEventListener('change', () => {
    state.motivationReminder.enabled = reminderToggle.checked
  })

  qs<HTMLButtonElement>('#chip-add').addEventListener('click', () => {
    const value = chipInput.value.trim()
    if (!value) return
    if (state.todayPlan.customChips.includes(value) || state.todayPlan.chips.includes(value)) {
      window.alert('同じ候補がすでに登録されています')
      return
    }
    state.todayPlan.customChips.push(value)
    chipInput.value = ''
    renderPlanner()
    void persistPlannerChips()
  })

  qs<HTMLButtonElement>('#planner-save').addEventListener('click', async () => {
    const text = plannerText.value.trim()
    if (!text) {
      window.alert('計画を入力してください')
      plannerText.focus()
      return
    }
    state.todayPlan.text = text
    const key = formatDateKey(state.todayDate)
    const record = getRecord(key, true)!
    const now = new Date()
    record.plan = { text, updatedAt: formatTimestamp(now) }
    record.streak = record.streak || 0
    state.review.pending = !record.review
    try {
      await saveNightPlan(key, record.plan, state.avoidanceGoals)
      window.alert('計画を保存しました')
    } catch (error) {
      console.error('計画の保存に失敗しました', error)
      window.alert('計画の保存に失敗しました')
    }
    refreshTodayView()
    renderCalendar()
  })

  qs<HTMLButtonElement>('#switch-to-review').addEventListener('click', () => {
    plannerCard.classList.add('hidden')
    reviewCard.classList.remove('hidden')
    currentTodayView = 'review'
    renderReview()
  })

  qs<HTMLButtonElement>('#switch-to-plan').addEventListener('click', () => {
    reviewCard.classList.add('hidden')
    plannerCard.classList.remove('hidden')
    currentTodayView = 'plan'
    renderPlanner()
  })

  qs<HTMLButtonElement>('#review-save').addEventListener('click', async () => {
    if (!state.review.rating) {
      window.alert('評価を選択してください')
      return
    }
    state.review.notes = reviewText.value.trim()
    state.review.pending = false
    const now = new Date()
    state.review.reviewTimestamp = now
    const key = formatDateKey(state.todayDate)
    const record = getRecord(key, true)!
    record.plan = record.plan ?? { text: state.todayPlan.text, updatedAt: formatTimestamp(now) }
    const ratingSymbol = deriveStatusFromRating(state.review.rating)
    record.review = {
      text: state.review.notes || 'レビュー未記入',
      rating: ratingSymbol,
      mood: state.review.mood,
      avoided: [...state.review.avoided],
      updatedAt: formatTimestamp(now),
    }
    state.streak = computeCurrentStreak(state.records)
    record.streak = state.streak

    try {
      await saveNightReview(key, record.review, state.streak)
      window.alert('レビューを保存しました')
    } catch (error) {
      console.error('レビューの保存に失敗しました', error)
      window.alert('レビューの保存に失敗しました')
    }
    reviewCard.classList.add('hidden')
    plannerCard.classList.remove('hidden')
    currentTodayView = 'plan'
    renderPlanner()
    renderCalendar()
  })

  ratingButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const rating = button.dataset.rating as ReviewRating | undefined
      if (!rating) return
      state.review.rating = rating
      ratingButtons.forEach((btn) => btn.classList.remove('active'))
      button.classList.add('active')
    })
  })

  moodSlider.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value)
    state.review.mood = value
    moodValue.textContent = `${value}`
  })
}

function deriveStatusFromRating(rating: ReviewRating | null): RatingSymbol {
  switch (rating) {
    case 'great':
      return '◎'
    case 'good':
      return '○'
    case 'ok':
      return '△'
    case 'bad':
      return '✕'
    default:
      return '○'
  }
}

function bindSettingsForm() {
  populateSettingsForm()

  settingForm.addEventListener('submit', async (event) => {
    event.preventDefault()

    const name = settingName.value.trim() || state.displayName
    const goals = settingGoals.value
      .split(',')
      .map((goal) => goal.trim())
      .filter((goal) => goal.length > 0)
    const plannerLabelInput = settingPlannerLabel.value.trim() || state.plannerLabel
    const planStart = settingPlanStart.value || state.plannerPromptTimeslot.start
    const planEnd = settingPlanEnd.value || state.plannerPromptTimeslot.end
    const reviewTime = settingReviewTime.value || state.reviewPromptTime
    const motivationTime = settingMotivationTime.value || state.motivationReminder.time
    const avoidanceGoals = goals.length > 0 ? goals : state.avoidanceGoals
    const rawGratitudeLines = settingGratitude.value.replace(/\r\n/g, '\n').split('\n')
    if (rawGratitudeLines.length > 60) {
      settingsMessage.textContent = 'ありがてえ言葉は最大60行まで入力できます'
      return
    }
    const gratitudeMessages = rawGratitudeLines.map((line) => line.trim()).filter((line) => line.length > 0)

    const updatedSettings: UserSettings = {
      displayName: name,
      avoidanceGoals,
      plannerLabel: plannerLabelInput,
      plannerPromptTimeslot: {
        start: planStart,
        end: planEnd,
        randomize: state.plannerPromptTimeslot.randomize,
      },
      reviewPromptTime: reviewTime,
      motivationReminder: {
        time: motivationTime,
        enabled: state.motivationReminder.enabled,
      },
      gratitudeMessages,
      plannerChips: [...state.todayPlan.customChips],
      passcodeEnabled: settingPasscode.checked,
    }

    try {
      applySettings(updatedSettings)
      renderPlanner()
      renderReview()
      updateHeaderForTab(currentTab)
      populateSettingsForm()
      refreshGratitudeMessage()
      settingsMessage.textContent = '保存中...'
      await saveUserSettings(updatedSettings)
      settingsMessage.textContent = '保存しました'
    } catch (error) {
      console.error('設定の保存に失敗しました', error)
      settingsMessage.textContent = '保存に失敗しました'
    } finally {
      window.setTimeout(() => {
        settingsMessage.textContent = ''
      }, 2000)
    }
  })

  qs<HTMLButtonElement>('#setting-reset').addEventListener('click', () => {
    populateSettingsForm()
    settingsMessage.textContent = 'リセットしました'
    window.setTimeout(() => {
      settingsMessage.textContent = ''
    }, 1500)
  })
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('ServiceWorkerがサポートされていません')
  }
  const swUrl = new URL('./firebase-messaging-sw.ts', import.meta.url)
  const registration = await navigator.serviceWorker.register(swUrl, { type: 'module' })
  return registration
}

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') {
    return 'denied'
  }
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  if (Notification.permission === 'denied') {
    return 'denied'
  }
  return await Notification.requestPermission()
}

async function retrieveMessagingToken(): Promise<string> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) {
    throw new Error('このブラウザではプッシュ通知を利用できません')
  }
  const registration = await ensureServiceWorker()
  if (!VAPID_KEY) {
    throw new Error('VAPIDキーが設定されていません')
  }
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) {
    throw new Error('トークン取得に失敗しました')
  }
  cachedPushToken = token
  return token
}

async function registerTokenWithBackend(token: string): Promise<void> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/registerPushToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    }),
  })
  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`サーバー登録に失敗しました: ${payload}`)
  }
}

async function handlePushRegistration() {
  pushStatus.textContent = '通知許可を確認中...'
  try {
    const permission = await requestNotificationPermission()
    if (permission !== 'granted') {
      pushStatus.textContent = '通知が許可されていません（設定から許可が必要です）'
      return
    }
    const token = await retrieveMessagingToken()
    pushStatus.textContent = 'サーバーへ登録中...'
    await registerTokenWithBackend(token)
    pushStatus.textContent = '通知が有効になりました'
    pushTestButton.disabled = false
  } catch (error) {
    console.error(error)
    pushStatus.textContent = error instanceof Error ? error.message : '通知登録に失敗しました'
  }
}

async function sendTestNotification() {
  pushStatus.textContent = 'テスト通知を送信中...'
  try {
    const token = cachedPushToken ?? (await retrieveMessagingToken())
    const response = await fetch(`${FUNCTIONS_BASE_URL}/sendTestNotification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) {
      const payload = await response.text()
      throw new Error(`送信失敗: ${payload}`)
    }
    pushStatus.textContent = 'テスト通知を送信しました'
  } catch (error) {
    console.error(error)
    pushStatus.textContent = error instanceof Error ? error.message : 'テスト通知の送信に失敗しました'
  }
}

async function setupPushMessaging() {
  try {
    const messaging = await getMessagingIfSupported()
    if (!messaging) {
      pushSetup.dataset.support = 'unsupported'
      pushStatus.textContent = 'このブラウザではプッシュ通知を利用できません'
      pushRequestButton.disabled = true
      pushTestButton.disabled = true
      return
    }
    pushSetup.dataset.support = 'supported'
    pushStatus.textContent = Notification.permission === 'granted' ? '通知は有効です' : '通知は未登録です'
    pushTestButton.disabled = Notification.permission !== 'granted'

    onMessage(messaging, (payload) => {
      if (!payload.notification?.title) return
      const title = payload.notification.title
      const body = payload.notification.body ?? ''
      settingsMessage.textContent = `${title} - ${body}`
      window.setTimeout(() => {
        settingsMessage.textContent = ''
      }, 4000)
    })
  } catch (error) {
    console.error(error)
    pushStatus.textContent = '通知機能の初期化に失敗しました'
  }
}

async function hydrateNightLogs() {
  try {
    const records = await fetchNightLogs()
    state.records = records
    state.streak = computeCurrentStreak(state.records)
    loadSelectedDate(state.todayDate)
    renderPlanner()
    renderReview()
    renderCalendar()
    refreshTodayView()
  } catch (error) {
    console.error('Firestoreからのログ取得に失敗しました', error)
  }
}

async function hydrateUserSettings(options: { showOpening?: boolean } = {}) {
  try {
    const partial = await fetchUserSettings()
    const merged = mergeUserSettings(partial)
    applySettings(merged)
    refreshGratitudeMessage({ method: 'random', showOpening: options.showOpening })
    renderPlanner()
    renderReview()
    populateSettingsForm()
    updateHeaderForTab(currentTab)
  } catch (error) {
    console.error('ユーザー設定の取得に失敗しました', error)
    if (options.showOpening) {
      refreshGratitudeMessage({ showOpening: true })
    }
  }
}

function bindModal() {
  qs<HTMLButtonElement>('#modal-close').addEventListener('click', closeModal)
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal()
    }
  })
  modalEditPlan.addEventListener('click', () => {
    if (!activeModalDateKey) return
    const targetKey = activeModalDateKey
    closeModal()
    selectDateForEditing(targetKey, 'plan')
  })
  modalEditReview.addEventListener('click', () => {
    if (!activeModalDateKey) return
    const targetKey = activeModalDateKey
    closeModal()
    selectDateForEditing(targetKey, 'review')
  })
  modalDelete.addEventListener('click', () => {
    if (!activeModalDateKey) return
    if (window.confirm('この日の記録を削除しますか？')) {
      const targetKey = activeModalDateKey
      closeModal()
      void deleteNightRecord(targetKey)
    }
  })
}

function init() {
  refreshGratitudeMessage({ method: 'random' })
  renderPlanner()
  renderReview()
  renderCalendar()
  bindTabBar()
  bindGratitudeInteractions()
  bindTodayActions()
  bindSettingsForm()
  bindModal()
  switchTab('today')
  refreshTodayView()
  pushRequestButton.addEventListener('click', () => {
    void handlePushRegistration()
  })
  pushTestButton.addEventListener('click', () => {
    void sendTestNotification()
  })
  void setupPushMessaging()
  void hydrateUserSettings({ showOpening: true })
  void hydrateNightLogs()
  window.setInterval(updateDateTimeDisplay, 60000)
}

init()
