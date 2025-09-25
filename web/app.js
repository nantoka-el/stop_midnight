const state = {
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
    customChips: [],
    chips: ['読書30分', '湯船に浸かる', '明日の準備', 'ストレッチ'],
    recommended: '先週はストレッチが連続達成。今夜も続けてみる？',
  },
  review: {
    pending: true,
    rating: null,
    notes: '',
    avoided: ['闇カジノ', '夜食'],
    mood: 4,
  },
};

const plannerPrompts = [
  '{name}さん！今日のやることを聞かせて下さい！',
  '{name}！とりあえず、今日のやることをここに書く。それから夜を過ごそう',
  '{name}ちゃん、今日のやることはもう決まってる？ゆっくり考えよう',
];

const reviewPrompts = [
  '{name}さん、{date}の夜は結局どうしてたの？',
  '{name}！{date}の夜はどんなだったか教えて！',
  '{name}ちゃん、今夜はどうお過ごしだったかな！聞かせて聞かせて〜！',
];

const calendarData = [
  { date: '9/20', status: '◎', plan: '映画を観る', review: '映画鑑賞でリフレッシュ。夜食も回避。', streak: 4 },
  { date: '9/21', status: '○', plan: 'ストレッチ', review: 'ストレッチのみ。深夜の誘惑なし。', streak: 5 },
  { date: '9/22', status: '△', plan: '本を読む', review: '途中でSNS見ちゃった。次は時間を決める。', streak: 0 },
  { date: '9/23', status: '◎', plan: '早めに寝る', review: 'ちゃんと寝れた。偉い。', streak: 1 },
  { date: '9/24', status: '○', plan: '読書30分', review: 'ほぼ読書。お腹空いたけど耐えた。', streak: 2 },
  { date: '9/25', status: '✕', plan: 'アニメ2話のみ', review: '長引かせてしまった。振り返り大事。', streak: 0 },
  { date: '9/26', status: '◎', plan: '英語学習', review: '集中できた！', streak: 1 },
];

function formatDate(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function renderHeader() {
  const sub = document.getElementById('header-sub');
  sub.textContent = `${state.displayName}さん、夜の悪癖を今日で止めよう。連続${state.streak}日継続中。`;
  document.getElementById('header-title').textContent = 'Stop Midnight';
}

function randomPrompt(list, name, dateLabel) {
  const template = list[Math.floor(Math.random() * list.length)];
  return template.replace('{name}', name).replace('{date}', dateLabel);
}

function renderPlanner() {
  document.getElementById('today-date').textContent = formatDate(state.todayDate);
  document.getElementById('streak-count').textContent = state.streak;
  document.getElementById('header-sub').textContent = `${state.displayName}さん、夜の悪癖を今日で止めよう。連続${state.streak}日継続中。`;
  const badgeWrap = document.getElementById('avoidance-badges');
  badgeWrap.innerHTML = '';
  state.avoidanceGoals.forEach((goal) => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = goal;
    badgeWrap.appendChild(span);
  });

  document.getElementById('planner-label').textContent = state.plannerLabel;
  document.getElementById('planner-text').value = state.todayPlan.text;
  document.getElementById('recommended-area').textContent = state.todayPlan.recommended;
  document.getElementById('reminder-toggle').checked = true;

  const chipsWrap = document.getElementById('preset-chips');
  chipsWrap.innerHTML = '';
  const allChips = [...state.todayPlan.chips, ...state.todayPlan.customChips];
  allChips.forEach((chip) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = chip;
    button.addEventListener('click', () => {
      const textarea = document.getElementById('planner-text');
      const existing = textarea.value.trim();
      textarea.value = existing ? `${existing}\n${chip}` : chip;
    });
    chipsWrap.appendChild(button);
  });

  const prompt = randomPrompt(plannerPrompts, state.displayName);
  document.getElementById('planner-prompt').textContent = prompt;
}

function renderReview() {
  const dateLabel = `${state.todayDate.getMonth() + 1}/${state.todayDate.getDate() - 1}`;
  document.getElementById('review-night-label').textContent = `対象夜: ${dateLabel} (ログ上は ${formatDate(state.todayDate)})`;
  document.getElementById('previous-plan').textContent = `計画: ${state.todayPlan.text || '未入力'}`;
  document.getElementById('review-text').value = state.review.notes;
  document.getElementById('mood-slider').value = state.review.mood;
  document.getElementById('mood-value').textContent = state.review.mood;

  const checks = document.getElementById('avoidance-checks');
  checks.innerHTML = '';
  state.avoidanceGoals.forEach((goal) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.review.avoided.includes(goal);
    label.appendChild(input);
    const span = document.createElement('span');
    span.textContent = `${goal}を避けた`; // simple message
    label.appendChild(span);
    checks.appendChild(label);
  });

  document.querySelectorAll('#rating-group button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rating === state.review.rating);
  });

  const prompt = randomPrompt(reviewPrompts, state.displayName, dateLabel);
  document.getElementById('planner-prompt').textContent = prompt;
}

function switchTab(tab) {
  document.querySelectorAll('.tab-view').forEach((view) => {
    view.classList.toggle('active', view.id === `${tab}-view`);
    view.classList.toggle('hidden', view.id !== `${tab}-view`);
  });
  document.querySelectorAll('.tab-bar__item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  if (tab === 'today') {
    document.getElementById('header-sub').textContent = `${state.displayName}さん、夜の悪癖を今日で止めよう。連続${state.streak}日継続中。`;
  } else if (tab === 'calendar') {
    document.getElementById('header-sub').textContent = '過去の夜を振り返って、明日に繋げよう。';
  } else {
    document.getElementById('header-sub').textContent = '設定を見直して、自分にフィットさせよう。';
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const statusText = { '◎': '', '○': '', '△': '', '✕': '' };
  calendarData.forEach((day) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    dayEl.textContent = day.date;
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = day.status;
    if (day.status === '◎' || day.status === '○') {
      status.classList.add('good');
    } else if (day.status === '△') {
      status.classList.add('ok');
    } else {
      status.classList.add('bad');
    }
    cell.appendChild(dayEl);
    cell.appendChild(status);
    cell.addEventListener('click', () => openModal(day));
    grid.appendChild(cell);
  });
}

function openModal(day) {
  document.getElementById('modal-date').textContent = `${day.date} の夜`; 
  document.getElementById('modal-streak').textContent = day.streak ? `${day.streak}日連続達成` : '連続なし';
  document.getElementById('modal-plan').textContent = day.plan;
  document.getElementById('modal-review').textContent = day.review;
  document.getElementById('calendar-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('calendar-modal').classList.add('hidden');
}

function bindTabBar() {
  document.querySelectorAll('.tab-bar__item').forEach((item) => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });
}

function bindTodayActions() {
  document.getElementById('chip-add').addEventListener('click', () => {
    const input = document.getElementById('chip-input');
    const value = input.value.trim();
    if (value) {
      state.todayPlan.customChips.push(value);
      input.value = '';
      renderPlanner();
    }
  });

  document.getElementById('planner-save').addEventListener('click', () => {
    state.todayPlan.text = document.getElementById('planner-text').value.trim();
    state.review.pending = true;
    alert('計画を仮保存しました（モック）');
  });
  document.getElementById('switch-to-review').addEventListener('click', () => {
    document.getElementById('planner-card').classList.add('hidden');
    document.getElementById('review-card').classList.remove('hidden');
    renderReview();
  });
  document.getElementById('switch-to-plan').addEventListener('click', () => {
    document.getElementById('review-card').classList.add('hidden');
    document.getElementById('planner-card').classList.remove('hidden');
    renderPlanner();
  });

  document.getElementById('review-save').addEventListener('click', () => {
    state.review.notes = document.getElementById('review-text').value.trim();
    state.review.pending = false;
    alert('レビューを仮保存しました（モック）');
    document.getElementById('review-card').classList.add('hidden');
    document.getElementById('planner-card').classList.remove('hidden');
    renderPlanner();
  });

  document.querySelectorAll('#rating-group button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.review.rating = btn.dataset.rating;
      document.querySelectorAll('#rating-group button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('mood-slider').addEventListener('input', (event) => {
    state.review.mood = Number(event.target.value);
    document.getElementById('mood-value').textContent = event.target.value;
  });
}

function bindSettingsForm() {
  const form = document.getElementById('setting-form');
  const message = document.getElementById('settings-message');

  function fillForm() {
    document.getElementById('setting-name').value = state.displayName;
    document.getElementById('setting-goals').value = state.avoidanceGoals.join(', ');
    document.getElementById('setting-planner-label').value = state.plannerLabel;
    document.getElementById('setting-plan-start').value = state.plannerPromptTimeslot.start;
    document.getElementById('setting-plan-end').value = state.plannerPromptTimeslot.end;
    document.getElementById('setting-review-time').value = state.reviewPromptTime;
    document.getElementById('setting-motivation-time').value = state.motivationReminder.time;
    document.getElementById('setting-passcode').checked = state.passcodeEnabled;
  }

  fillForm();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.displayName = document.getElementById('setting-name').value.trim() || state.displayName;
    state.avoidanceGoals = document.getElementById('setting-goals').value.split(',').map((s) => s.trim()).filter(Boolean) || state.avoidanceGoals;
    state.plannerLabel = document.getElementById('setting-planner-label').value.trim() || state.plannerLabel;
    state.plannerPromptTimeslot.start = document.getElementById('setting-plan-start').value || state.plannerPromptTimeslot.start;
    state.plannerPromptTimeslot.end = document.getElementById('setting-plan-end').value || state.plannerPromptTimeslot.end;
    state.reviewPromptTime = document.getElementById('setting-review-time').value || state.reviewPromptTime;
    state.motivationReminder.time = document.getElementById('setting-motivation-time').value || state.motivationReminder.time;
    state.passcodeEnabled = document.getElementById('setting-passcode').checked;

    renderHeader();
    renderPlanner();
    message.textContent = '保存しました（モック）';
    setTimeout(() => { message.textContent = ''; }, 1800);
  });

  document.getElementById('setting-reset').addEventListener('click', () => {
    fillForm();
    message.textContent = 'リセットしました';
    setTimeout(() => { message.textContent = ''; }, 1500);
  });
}

function initModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('calendar-modal').addEventListener('click', (event) => {
    if (event.target.id === 'calendar-modal') {
      closeModal();
    }
  });
}

function init() {
  renderHeader();
  renderPlanner();
  renderReview();
  renderCalendar();
  bindTabBar();
  bindTodayActions();
  bindSettingsForm();
  initModal();
  switchTab('today');
}

document.addEventListener('DOMContentLoaded', init);
