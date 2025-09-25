import './style.css'
import { getToken, onMessage } from 'firebase/messaging'
import { getMessagingIfSupported } from './firebase'

type RatingSymbol = '◎' | '○' | '△' | '✕'
type ReviewRating = 'great' | 'good' | 'ok' | 'bad'

type PlannerTimeslot = {
  start: string
  end: string
  randomize: boolean
}

type MotivationReminder = {
  time: string
  enabled: boolean
}

type TodayPlan = {
  text: string
  chips: string[]
  customChips: string[]
  recommended: string
}

type ReviewState = {
  pending: boolean
  rating: ReviewRating | null
  notes: string
  avoided: string[]
  mood: number
  reviewTimestamp?: Date
}

type NightPlan = {
  text: string
  updatedAt: string
}

type NightReview = {
  text: string
  rating: RatingSymbol
  mood: number
  avoided: string[]
  updatedAt: string
}

type NightRecord = {
  streak: number
  plan?: NightPlan
  review?: NightReview
}

type Achievement = {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  goal: number
  category: 'streak' | 'habit' | 'recovery'
}

type AppState = {
  displayName: string
  avoidanceGoals: string[]
  plannerLabel: string
  plannerPromptTimeslot: PlannerTimeslot
  reviewPromptTime: string
  motivationReminder: MotivationReminder
  passcodeEnabled: boolean
  streak: number
  todayDate: Date
  todayPlan: TodayPlan
  review: ReviewState
  achievements: Achievement[]
  records: Record<string, NightRecord>
}

const initialRecords: Record<string, NightRecord> = {
  '2025/09/20': {
    streak: 4,
    plan: { text: '映画を観る', updatedAt: '2025/09/20 21:00' },
    review: { text: '映画鑑賞でリフレッシュ。夜食も回避。', rating: '◎', mood: 5, avoided: ['夜食'], updatedAt: '2025/09/21 04:05' },
  },
  '2025/09/21': {
    streak: 5,
    plan: { text: 'ストレッチ', updatedAt: '2025/09/21 20:30' },
    review: { text: 'ストレッチのみ。深夜の誘惑なし。', rating: '○', mood: 4, avoided: ['夜食'], updatedAt: '2025/09/22 04:03' },
  },
  '2025/09/22': {
    streak: 0,
    plan: { text: '本を読む', updatedAt: '2025/09/22 21:10' },
    review: { text: '途中でSNS見ちゃった。次は時間を決める。', rating: '△', mood: 3, avoided: ['闇カジノ'], updatedAt: '2025/09/23 09:15' },
  },
  '2025/09/23': {
    streak: 1,
    plan: { text: '早めに寝る', updatedAt: '2025/09/23 21:15' },
    review: { text: 'ちゃんと寝れた。偉い。', rating: '◎', mood: 5, avoided: ['夜食'], updatedAt: '2025/09/24 04:02' },
  },
  '2025/09/24': {
    streak: 2,
    plan: { text: '読書30分', updatedAt: '2025/09/24 20:45' },
    review: { text: 'ほぼ読書。お腹空いたけど耐えた。', rating: '○', mood: 4, avoided: ['夜食'], updatedAt: '2025/09/25 04:01' },
  },
  '2025/09/25': {
    streak: 0,
    plan: { text: 'アニメ2話のみ', updatedAt: '2025/09/25 21:30' },
    review: { text: '長引かせてしまった。振り返り大事。', rating: '✕', mood: 2, avoided: [], updatedAt: '2025/09/26 10:12' },
  },
  '2025/09/26': {
    streak: 1,
    plan: { text: '英語学習', updatedAt: '2025/09/26 20:20' },
    review: { text: '集中できた！', rating: '◎', mood: 5, avoided: ['闇カジノ'], updatedAt: '2025/09/27 04:08' },
  },
}

const state: AppState = {
  displayName: 'りんね',
  avoidanceGoals: ['闇カジノ', '夜食'],
  plannerLabel: '今夜は何をする？',
  plannerPromptTimeslot: { start: '22:00', end: '23:00', randomize: true },
  reviewPromptTime: '04:00',
  motivationReminder: { time: '21:00', enabled: true },
  passcodeEnabled: false,
  streak: 3,
  todayDate: new Date(),
  todayPlan: {
    text: '',
    chips: ['読書30分', '湯船に浸かる', '明日の準備', 'ストレッチ'],
    customChips: [],
    recommended: '先週はストレッチが連続達成。今夜も続けてみる？',
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
  records: initialRecords,
}

loadSelectedDate(state.todayDate)

const plannerPrompts = [
  '{name}さん！今日のやることを聞かせて下さい！',
  '{name}！とりあえず、今日のやることをここに書く。それから夜を過ごそう',
  '{name}ちゃん、今日のやることはもう決まってる？ゆっくり考えよう',
]

const reviewPrompts = [
  '{name}さん、{date}の夜は結局どうしてたの？',
  '{name}！{date}の夜はどんなだったか教えて！',
  '{name}ちゃん、今夜はどうお過ごしだったかな！聞かせて聞かせて〜！',
]

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

function getRecord(dateKey: string, create = false): NightRecord | undefined {
  let record = state.records[dateKey]
  if (!record && create) {
    record = { streak: 0 }
    state.records[dateKey] = record
  }
  return record
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
  state.todayPlan.customChips = []

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

function randomPrompt(list: string[], name: string, dateLabel?: string): string {
  const template = list[Math.floor(Math.random() * list.length)]
  return template.replace('{name}', name).replace('{date}', dateLabel ?? '')
}

const appRoot = qs<HTMLDivElement>('#app')

appRoot.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <h1 id="header-title">Stop Midnight</h1>
      <p id="header-sub" class="app-header__sub"></p>
      <div class="hero" id="hero-card">
        <div class="hero__streak">
          <span class="hero__label">連続継続</span>
          <span class="hero__count" id="hero-streak-count">0</span>
          <span class="hero__unit">日</span>
          <div class="hero__next" id="hero-next-target"></div>
        </div>
        <div class="hero__state" id="today-state-badge" data-state="plan">
          <span class="hero__state-icon" id="today-state-icon">📝</span>
          <div class="hero__state-text">
            <span class="hero__state-label" id="today-state-label">PLANモード</span>
            <small id="today-state-desc">今夜の計画を決めましょう</small>
          </div>
        </div>
      </div>
      <div class="achievement-strip" id="achievement-strip"></div>
      <div class="next-target" id="next-target"></div>
    </header>

    <section id="today-view" class="tab-view active">
      <div class="today-steps" id="today-steps">
        <div class="today-step" data-step="plan">
          <span class="today-step__number">1</span>
          <span class="today-step__label">PLAN</span>
        </div>
        <div class="today-step" data-step="review">
          <span class="today-step__number">2</span>
          <span class="today-step__label">REVIEW</span>
        </div>
      </div>
      <div class="status-pill" id="today-status"></div>
      <div class="plan-summary hidden" id="plan-summary">
        <div class="plan-summary__header">
          <span class="plan-summary__title">今日の計画</span>
          <button type="button" id="plan-summary-edit" class="ghost small">編集する</button>
        </div>
        <p id="plan-summary-text"></p>
      </div>
      <div class="prompt" id="planner-prompt"></div>
      <div class="today-card" id="planner-card">
        <div class="today-meta">
          <div><span id="today-date">--</span> ・ 連続達成 <span id="streak-count">0</span>日</div>
          <div class="badges" id="avoidance-badges"></div>
        </div>
        <div class="recommended" id="recommended-area">
          <div class="recommended__header">
            <span class="recommended__icon">✨</span>
            <span class="recommended__title">リコメンド</span>
          </div>
          <div class="recommended__body" id="recommended-body"></div>
        </div>
        <label class="field">
          <span id="planner-label">今夜は何をする？</span>
          <textarea id="planner-text" rows="3" placeholder="例: 読書30分＋ストレッチ"></textarea>
        </label>
        <div class="chips" id="preset-chips"></div>
        <div class="chip-input">
          <input type="text" id="chip-input" placeholder="自分の候補を追加">
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
    </section>

    <section id="calendar-view" class="tab-view hidden">
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
        <label class="toggle">
          <input type="checkbox" id="setting-passcode">
          <span>パスコードロックを有効にする（モック）</span>
        </label>
        <div class="settings-actions">
          <button type="submit" class="primary">保存（モック）</button>
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
const headerSub = qs<HTMLParagraphElement>('#header-sub')
const heroCard = qs<HTMLDivElement>('#hero-card')
const heroStreakCount = qs<HTMLSpanElement>('#hero-streak-count')
const heroNextTarget = qs<HTMLDivElement>('#hero-next-target')
const todayStateBadge = qs<HTMLDivElement>('#today-state-badge')
const todayStateIcon = qs<HTMLSpanElement>('#today-state-icon')
const todayStateLabel = qs<HTMLSpanElement>('#today-state-label')
const todayStateDesc = qs<HTMLSpanElement>('#today-state-desc')
const achievementStrip = qs<HTMLDivElement>('#achievement-strip')
const nextTargetMessage = qs<HTMLDivElement>('#next-target')
const plannerPrompt = qs<HTMLDivElement>('#planner-prompt')
const todayDateEl = qs<HTMLSpanElement>('#today-date')
const todaySteps = Array.from(document.querySelectorAll<HTMLElement>('.today-step'))
const statusPill = qs<HTMLDivElement>('#today-status')
const planSummaryCard = qs<HTMLDivElement>('#plan-summary')
const planSummaryText = qs<HTMLParagraphElement>('#plan-summary-text')
const planSummaryEdit = qs<HTMLButtonElement>('#plan-summary-edit')
const streakCount = qs<HTMLSpanElement>('#streak-count')
const badgesWrap = qs<HTMLDivElement>('#avoidance-badges')
const recommendedArea = qs<HTMLDivElement>('#recommended-area')
const recommendedBody = qs<HTMLDivElement>('#recommended-body')
const plannerLabel = qs<HTMLSpanElement>('#planner-label')
const plannerText = qs<HTMLTextAreaElement>('#planner-text')
const presetChips = qs<HTMLDivElement>('#preset-chips')
const chipInput = qs<HTMLInputElement>('#chip-input')
const reminderToggle = qs<HTMLInputElement>('#reminder-toggle')
const plannerCard = qs<HTMLDivElement>('#planner-card')
const reviewCard = qs<HTMLDivElement>('#review-card')
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
document.documentElement.dataset.todayState = 'plan'

function updateHeaderForTab(tab: 'today' | 'calendar' | 'setting') {
  if (tab === 'today') {
    headerSub.textContent = `${state.displayName}さん、夜の悪癖を今日で止めよう。連続${state.streak}日継続中。`
  } else if (tab === 'calendar') {
    headerSub.textContent = '過去の夜を振り返って、明日に繋げよう。'
  } else {
    headerSub.textContent = '設定を見直して、自分にフィットさせよう。'
  }
}

type TodayStage = 'plan-empty' | 'review-pending' | 'review-complete'

function getTodayStage(): TodayStage {
  const hasPlan = state.todayPlan.text.trim().length > 0
  if (!hasPlan) {
    return 'plan-empty'
  }
  return state.review.pending ? 'review-pending' : 'review-complete'
}

const STATUS_MAP: Record<TodayStage, { text: string; className: string }> = {
  'plan-empty': { text: 'ステータス: プラン入力待ち', className: 'status-pill status-plan' },
  'review-pending': { text: 'ステータス: レビュー待ち (プラン済み)', className: 'status-pill status-review' },
  'review-complete': { text: 'ステータス: レビュー完了', className: 'status-pill status-done' },
}

function updatePlanSummary() {
  const plan = state.todayPlan.text.trim()
  if (plan) {
    planSummaryCard.classList.remove('hidden')
    const key = formatDateKey(state.todayDate)
    const record = getRecord(key)
    const updatedAt = record?.plan?.updatedAt ? `\n更新: ${record.plan.updatedAt}` : ''
    planSummaryText.textContent = `${plan}${updatedAt}`
  } else {
    planSummaryCard.classList.add('hidden')
    planSummaryText.textContent = ''
  }
}

function updateStepIndicators(stage: TodayStage) {
  const planStep = todaySteps.find((el) => el.dataset.step === 'plan')
  const reviewStep = todaySteps.find((el) => el.dataset.step === 'review')
  todaySteps.forEach((step) => step.classList.remove('is-current', 'is-complete'))

  if (planStep) {
    if (stage !== 'plan-empty') {
      planStep.classList.add('is-complete')
    }
    if (currentTodayView === 'plan' || stage === 'plan-empty') {
      planStep.classList.add('is-current')
    }
  }

  if (reviewStep) {
    if (stage === 'review-complete') {
      reviewStep.classList.add('is-complete')
    }
    if (currentTodayView === 'review') {
      reviewStep.classList.add('is-current')
    }
  }
}

function updateStatusPill(stage: TodayStage) {
  const info = STATUS_MAP[stage]
  statusPill.className = info.className
  statusPill.textContent = info.text
}

function updateTodayUI() {
  const stage = getTodayStage()
  updatePlanSummary()
  updateStepIndicators(stage)
  updateStatusPill(stage)
  updateTodayStateBadge(stage)
  updateShellTheme(stage)
}

function updateTodayStateBadge(stage: TodayStage) {
  const isPlanStage = stage === 'plan-empty' || currentTodayView === 'plan'
  const stateKey = isPlanStage ? 'plan' : 'review'
  todayStateBadge.dataset.state = stateKey
  todayStateIcon.textContent = isPlanStage ? '📝' : '🌅'
  todayStateLabel.textContent = isPlanStage ? 'PLANモード' : 'REVIEWモード'
  todayStateDesc.textContent = isPlanStage ? '今夜の計画を決めましょう' : '昨夜の振り返りを記録しましょう'
}

function updateShellTheme(stage: TodayStage) {
  if (currentTab !== 'today') {
    document.documentElement.dataset.todayState = 'neutral'
    heroCard.dataset.state = 'plan'
    return
  }
  const themeState = stage === 'review-complete' || currentTodayView === 'review' ? 'review' : 'plan'
  document.documentElement.dataset.todayState = themeState
  heroCard.dataset.state = themeState
}

function renderAchievements() {
  achievementStrip.innerHTML = ''
  state.achievements.forEach((achievement) => {
    const card = document.createElement('div')
    card.className = 'achievement-card'
    card.dataset.locked = (!achievement.unlocked).toString()
    const ratio = Math.min(achievement.progress / achievement.goal, 1)
    card.innerHTML = `
      <div class="achievement-card__header">
        <span class="achievement-card__icon">${achievement.icon}</span>
        <div class="achievement-card__titles">
          <strong>${achievement.title}</strong>
          <small>${achievement.description}</small>
        </div>
      </div>
      <div class="achievement-card__progress">
        <div class="achievement-card__bar" style="width: ${ratio * 100}%"></div>
      </div>
      <div class="achievement-card__footer">${achievement.unlocked ? '獲得済み' : `あと${Math.max(achievement.goal - achievement.progress, 0)}で解除`}</div>
    `
    achievementStrip.appendChild(card)
  })
  renderNextTargetMessage()
}

function renderNextTargetMessage() {
  const pending = state.achievements.filter((ach) => !ach.unlocked)
  if (pending.length === 0) {
    nextTargetMessage.textContent = '称号コンプリート！おめでとうございます 🎉'
    heroNextTarget.textContent = '目標達成ずみ！すばらしい！'
    return
  }
  const next = pending.reduce((best, curr) => (curr.progress / curr.goal) > (best.progress / best.goal) ? curr : best)
  const remaining = Math.max(next.goal - next.progress, 0)
  const percent = Math.min((next.progress / next.goal) * 100, 100).toFixed(0)
  nextTargetMessage.textContent = `${next.title} まであと ${remaining}。進捗 ${percent}%`
  heroNextTarget.textContent = `次は ${next.title} まであと ${remaining}`
}

function renderPlanner() {
  heroStreakCount.textContent = `${state.streak}`
  todayDateEl.textContent = formatDate(state.todayDate)
  streakCount.textContent = `${state.streak}`
  badgesWrap.innerHTML = ''
  state.avoidanceGoals.forEach((goal) => {
    const badge = document.createElement('span')
    badge.className = 'badge'
    badge.textContent = goal
    badgesWrap.appendChild(badge)
  })

  plannerLabel.textContent = state.plannerLabel
  plannerText.value = state.todayPlan.text
  recommendedBody.textContent = state.todayPlan.recommended
  recommendedArea.dataset.state = 'plan'
  reminderToggle.checked = true

  presetChips.innerHTML = ''
  const allChips = [...state.todayPlan.chips, ...state.todayPlan.customChips]
  allChips.forEach((chip) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chip'
    button.textContent = chip
    button.addEventListener('click', () => {
      const existing = plannerText.value.trim()
      plannerText.value = existing ? `${existing}\n${chip}` : chip
    })
    presetChips.appendChild(button)
  })

  const prompt = randomPrompt(plannerPrompts, state.displayName)
  plannerPrompt.textContent = prompt
  plannerPrompt.dataset.type = 'plan'
  updateTodayUI()
}

function renderReview() {
  const dateLabel = formatMonthDay(state.todayDate)

  reviewNightLabel.textContent = `対象夜: ${dateLabel} (ログ上は ${formatDate(state.todayDate)})`
  previousPlanEl.textContent = `計画: ${state.todayPlan.text || '未入力'}`
  reviewText.value = state.review.notes
  moodSlider.value = `${state.review.mood}`
  moodValue.textContent = `${state.review.mood}`
  recommendedArea.dataset.state = 'review'

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

  const prompt = randomPrompt(reviewPrompts, state.displayName, dateLabel)
  plannerPrompt.textContent = prompt
  plannerPrompt.dataset.type = 'review'
  updateTodayUI()
}

let activeModalDateKey: string | null = null

function renderCalendar() {
  calendarGrid.innerHTML = ''
  const entries = Object.entries(state.records).sort((a, b) => a[0].localeCompare(b[0]))
  entries.forEach(([dateKey, record]) => {
    const cell = document.createElement('div')
    cell.className = 'calendar-cell'
    const moodLevel = record.review?.mood ?? 0
    cell.dataset.state = record.review ? 'recorded' : 'blank'
    cell.dataset.mood = moodLevel ? `m${moodLevel}` : 'none'

    const dayEl = document.createElement('div')
    dayEl.className = 'day'
    const parsedDate = new Date(dateKey)
    dayEl.textContent = Number.isNaN(parsedDate.getTime()) ? dateKey : formatMonthDay(parsedDate)

    const status = document.createElement('div')
    status.className = 'status'
    const symbol = record.review?.rating ?? '△'
    status.textContent = symbol
    if (symbol === '◎' || symbol === '○') {
      status.classList.add('good')
    } else if (symbol === '△') {
      status.classList.add('ok')
    } else {
      status.classList.add('bad')
    }

    const mood = document.createElement('div')
    mood.className = 'status-mood'
    mood.textContent = moodLevel ? '★'.repeat(moodLevel) + '☆'.repeat(5 - moodLevel) : '-----'

    cell.append(dayEl, status, mood)
    cell.addEventListener('click', () => openModal(dateKey))
    calendarGrid.appendChild(cell)
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
  const isToday = tab === 'today'
  heroCard.classList.toggle('hidden', !isToday)
  updateShellTheme(getTodayStage())
  if (isToday) {
    updateTodayUI()
  }
  updateHeaderForTab(tab)
}

function selectDateForEditing(dateKey: string, target: 'plan' | 'review') {
  const date = new Date(dateKey)
  if (Number.isNaN(date.getTime())) {
    window.alert('日付の形式が正しくありません')
    return
  }
  loadSelectedDate(date)
  renderPlanner()
  renderReview()
  switchTab('today')
  currentTodayView = target
  if (target === 'plan') {
    plannerCard.classList.remove('hidden')
    reviewCard.classList.add('hidden')
    window.setTimeout(() => plannerText.focus(), 50)
  } else {
    plannerCard.classList.add('hidden')
    reviewCard.classList.remove('hidden')
    window.setTimeout(() => reviewText.focus(), 50)
  }
  updateTodayUI()
}

function deleteRecord(dateKey: string) {
  const record = getRecord(dateKey)
  if (!record) return
  delete state.records[dateKey]
  if (formatDateKey(state.todayDate) === dateKey) {
    loadSelectedDate(state.todayDate)
    renderPlanner()
    renderReview()
    updateTodayUI()
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

function bindTodayActions() {
  qs<HTMLButtonElement>('#chip-add').addEventListener('click', () => {
    const value = chipInput.value.trim()
    if (!value) return
    state.todayPlan.customChips.push(value)
    chipInput.value = ''
    renderPlanner()
  })

  qs<HTMLButtonElement>('#planner-save').addEventListener('click', () => {
    const text = plannerText.value.trim()
    if (!text) {
      window.alert('計画を入力してください')
      plannerText.focus()
      return
    }
    state.todayPlan.text = text
    const key = formatDateKey(state.todayDate)
    const record = getRecord(key, true)!
    record.plan = { text, updatedAt: formatTimestamp(new Date()) }
    record.streak = record.streak || 0
    state.review.pending = !record.review
    window.alert('計画を保存しました（モック）')
    updateTodayUI()
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

  planSummaryEdit.addEventListener('click', () => {
    plannerCard.classList.remove('hidden')
    reviewCard.classList.add('hidden')
    currentTodayView = 'plan'
    renderPlanner()
    window.setTimeout(() => plannerText.focus(), 50)
  })

  qs<HTMLButtonElement>('#review-save').addEventListener('click', () => {
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
    record.streak = ratingSymbol === '◎' || ratingSymbol === '○' ? state.streak : 0

    window.alert('レビューを保存しました（モック）')
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
  function fillForm() {
    settingName.value = state.displayName
    settingGoals.value = state.avoidanceGoals.join(', ')
    settingPlannerLabel.value = state.plannerLabel
    settingPlanStart.value = state.plannerPromptTimeslot.start
    settingPlanEnd.value = state.plannerPromptTimeslot.end
    settingReviewTime.value = state.reviewPromptTime
    settingMotivationTime.value = state.motivationReminder.time
    settingPasscode.checked = state.passcodeEnabled
  }

  fillForm()

  settingForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const name = settingName.value.trim()
    state.displayName = name || state.displayName

    const goals = settingGoals.value
      .split(',')
      .map((goal) => goal.trim())
      .filter((goal) => goal.length > 0)
    if (goals.length > 0) {
      state.avoidanceGoals = goals
    }

    const newLabel = settingPlannerLabel.value.trim()
    if (newLabel) {
      state.plannerLabel = newLabel
    }

    state.plannerPromptTimeslot = {
      start: settingPlanStart.value || state.plannerPromptTimeslot.start,
      end: settingPlanEnd.value || state.plannerPromptTimeslot.end,
      randomize: state.plannerPromptTimeslot.randomize,
    }

    state.reviewPromptTime = settingReviewTime.value || state.reviewPromptTime
    state.motivationReminder.time = settingMotivationTime.value || state.motivationReminder.time
    state.passcodeEnabled = settingPasscode.checked

    renderPlanner()
    renderReview()
    settingsMessage.textContent = '保存しました（モック）'
    window.setTimeout(() => {
      settingsMessage.textContent = ''
    }, 2000)
  })

  qs<HTMLButtonElement>('#setting-reset').addEventListener('click', () => {
    fillForm()
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

function bindModal() {
  qs<HTMLButtonElement>('#modal-close').addEventListener('click', closeModal)
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal()
    }
  })
  modalEditPlan.addEventListener('click', () => {
    if (!activeModalDateKey) return
    closeModal()
    selectDateForEditing(activeModalDateKey, 'plan')
  })
  modalEditReview.addEventListener('click', () => {
    if (!activeModalDateKey) return
    closeModal()
    selectDateForEditing(activeModalDateKey, 'review')
  })
  modalDelete.addEventListener('click', () => {
    if (!activeModalDateKey) return
    if (window.confirm('この日の記録を削除しますか？')) {
      deleteRecord(activeModalDateKey)
      closeModal()
      if (formatDateKey(state.todayDate) === activeModalDateKey) {
        renderPlanner()
        renderReview()
        updateTodayUI()
      }
    }
  })
}

function init() {
  renderAchievements()
  renderPlanner()
  renderReview()
  renderCalendar()
  bindTabBar()
  bindTodayActions()
  bindSettingsForm()
  bindModal()
  switchTab('today')
  pushRequestButton.addEventListener('click', () => {
    void handlePushRegistration()
  })
  pushTestButton.addEventListener('click', () => {
    void sendTestNotification()
  })
  void setupPushMessaging()
}

init()
