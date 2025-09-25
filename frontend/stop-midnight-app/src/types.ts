export type RatingSymbol = '◎' | '○' | '△' | '✕'
export type ReviewRating = 'great' | 'good' | 'ok' | 'bad'

export type PlannerTimeslot = {
  start: string
  end: string
  randomize: boolean
}

export type MotivationReminder = {
  time: string
  enabled: boolean
}

export type TodayPlan = {
  text: string
  chips: string[]
  customChips: string[]
  recommended: string
}

export type ReviewState = {
  pending: boolean
  rating: ReviewRating | null
  notes: string
  avoided: string[]
  mood: number
  reviewTimestamp?: Date
}

export type NightPlan = {
  text: string
  updatedAt: string
}

export type NightReview = {
  text: string
  rating: RatingSymbol
  mood: number
  avoided: string[]
  updatedAt: string
}

export type NightRecord = {
  streak: number
  plan?: NightPlan
  review?: NightReview
}

export type Achievement = {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  goal: number
  category: 'streak' | 'habit' | 'recovery'
}

export type AppState = {
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
