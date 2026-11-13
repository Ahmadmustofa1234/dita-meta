/**
 * Alur misi 2D Ecoseaverse (Bab 6 IPA Kelas VII).
 * Data misi, avatar, dan soal berasal dari learning-data.js sehingga selalu
 * sama dengan metaverse 3D. Butuh halaman HTML dengan elemen berikut:
 * #task-area, #action-button, #scene-layer, #ai-message, #log-box,
 * #mission-list, #stat-science, #stat-care, #stat-health,
 * #bar-science, #bar-care, #bar-health, #badge-row,
 * #completion-overlay, #reset-button, #score-summary
 */
import { missions as learningMissions, avatars } from './learning-data.js';

const FLOATS_BY_CHAPTER = {
    A: [{ icon: '☀', x: 18, y: 40 }, { icon: '🐍', x: 62, y: 60 }],
    B: [{ icon: '🐟', x: 22, y: 46 }, { icon: '🦝', x: 70, y: 52 }],
    C: [{ icon: '🦋', x: 30, y: 50 }, { icon: '🐒', x: 66, y: 44 }],
    D: [{ icon: '🏭', x: 40, y: 48 }, { icon: '🛟', x: 74, y: 58 }],
    E: [{ icon: '🌳', x: 24, y: 52 }, { icon: '🌿', x: 68, y: 46 }]
};

/* Misi 1 memakai pilihan avatar; Misi 2-6 memakai soal subbab A-E;
   Misi 7 memakai soal post-test. Setiap activity memakai soal pertama dari paketnya. */
function buildMissions() {
    const list = [
        {
            title: learningMissions[0].title,
            tag: learningMissions[0].tag,
            image: 'assets/step1.png',
            description: learningMissions[0].description,
            ai: learningMissions[0].ai,
            taskTitle: 'Pilih avatar penjelajahmu',
            type: 'choice',
            action: 'Simpan Avatar',
            options: avatars.map((avatar) => `${avatar.icon} ${avatar.name}`),
            answer: null,
            log: 'Avatar tersimpan. Lanjutkan ke pre-test Bab 6.',
            score: learningMissions[0].score,
            floats: [{ icon: '🧭', x: 50, y: 50 }]
        }
    ];

    learningMissions.slice(1).forEach((mission, index) => {
        const question = mission.questions && mission.questions[0];
        const isPosttest = mission.type === 'posttest';
        const chapter = mission.chapter || (question && question.chapter) || 'A';
        list.push({
            title: mission.title,
            tag: mission.tag,
            image: `assets/step${index + 2}.png`,
            description: mission.description,
            ai: mission.ai,
            taskTitle: question ? `${isPosttest ? 'Post-test' : `Subbab ${question.chapter}`} · soal 1` : mission.title,
            type: question ? 'quiz' : 'choice',
            action: isPosttest ? 'Kumpulkan Jawaban' : 'Kunci Jawaban',
            options: question ? question.options : [],
            answer: question ? question.options[question.answer] : null,
            explanation: question ? question.explanation : '',
            log: `${isPosttest ? 'Post-test' : 'Misi'} ${chapter} selesai: ${question ? question.explanation : ''}`,
            score: mission.score,
            badge: mission.badge,
            floats: FLOATS_BY_CHAPTER[chapter] || []
        });
    });

    return list;
}

const missions = buildMissions();
const visibleBadges = ['Aksi Nyata', 'Laut Seimbang', 'Penjaga Laut'];

const state = {
    current: 0,
    unlocked: 0,
    completed: new Set(),
    selected: [],
    science: 0,
    care: 0,
    health: 35,
    badges: new Set()
};

const els = {
    missionList: document.getElementById('mission-list'),
    taskArea: document.getElementById('task-area'),
    taskTitle: document.getElementById('task-title'),
    sceneLayer: document.getElementById('scene-layer'),
    aiMessage: document.getElementById('ai-message'),
    logBox: document.getElementById('log-box'),
    actionButton: document.getElementById('action-button'),
    statScience: document.getElementById('stat-science'),
    statCare: document.getElementById('stat-care'),
    statHealth: document.getElementById('stat-health'),
    barScience: document.getElementById('bar-science'),
    barCare: document.getElementById('bar-care'),
    barHealth: document.getElementById('bar-health'),
    badgeRow: document.getElementById('badge-row'),
    scoreSummary: document.getElementById('score-summary'),
    completionOverlay: document.getElementById('completion-overlay'),
    resetButton: document.getElementById('reset-button')
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function render() {
    const mission = missions[state.current];
    if (!mission) return;

    renderMissionMap();
    renderScores();

    if (els.taskTitle) els.taskTitle.textContent = mission.taskTitle;
    if (els.aiMessage) els.aiMessage.textContent = mission.ai;

    state.selected = [];
    if (els.actionButton) {
        els.actionButton.textContent = mission.action;
        els.actionButton.disabled = true;
    }

    renderTask(mission);
    renderScene(mission);
}

function renderMissionMap() {
    if (!els.missionList) return;
    els.missionList.innerHTML = '';

    missions.forEach((mission, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mission-chip';
        button.disabled = index > state.unlocked;
        button.classList.toggle('is-current', index === state.current);
        button.classList.toggle('is-done', state.completed.has(index));
        button.textContent = `${state.completed.has(index) ? '✓' : index + 1}. ${mission.title}`;
        button.addEventListener('click', () => {
            if (index > state.unlocked) return;
            state.current = index;
            render();
        });
        els.missionList.appendChild(button);
    });
}

function renderTask(mission) {
    if (!els.taskArea) return;
    els.taskArea.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = getGridClass(mission.type);
    mission.options.forEach((label) => wrapper.appendChild(createChoice(label, false)));
    els.taskArea.appendChild(wrapper);
}

function getGridClass(type) {
    return type === 'multi' ? 'action-grid' : 'choice-grid';
}

function createChoice(label, allowMany) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task-choice';
    button.textContent = label;
    button.addEventListener('click', () => selectChoice(button, label, allowMany));
    return button;
}

function selectChoice(button, label, allowMany) {
    if (!allowMany) {
        state.selected = [label];
        [...els.taskArea.querySelectorAll('.task-choice')].forEach((item) => item.classList.remove('is-selected'));
        button.classList.add('is-selected');
    } else if (state.selected.includes(label)) {
        state.selected = state.selected.filter((item) => item !== label);
        button.classList.remove('is-selected');
    } else {
        state.selected.push(label);
        button.classList.add('is-selected');
    }

    if (els.actionButton) els.actionButton.disabled = state.selected.length === 0;
}

function renderScene(mission) {
    if (!els.sceneLayer) return;
    els.sceneLayer.innerHTML = '';

    (mission.floats || []).forEach((item, index) => {
        const float = document.createElement('span');
        float.className = `float-item${item.bad ? ' pollution' : ''}${item.clean ? ' clean' : ''}`;
        float.textContent = item.icon;
        float.style.left = `${item.x}%`;
        float.style.top = `${item.y}%`;
        float.style.animationDelay = `${index * 0.35}s`;
        els.sceneLayer.appendChild(float);
    });
}

function completeCurrentMission() {
    const mission = missions[state.current];
    if (!validateMission(mission)) return;

    if (!state.completed.has(state.current)) {
        state.completed.add(state.current);
        state.science = clamp(state.science + mission.score.science, 0, 100);
        state.care = clamp(state.care + mission.score.care, 0, 100);
        state.health = clamp(state.health + mission.score.health, 0, 100);
        if (mission.badge) state.badges.add(mission.badge);
        if (state.science >= 40) state.badges.add('Literasi');
        addLog(mission.log);
    }

    state.unlocked = Math.max(state.unlocked, Math.min(state.current + 1, missions.length - 1));

    if (state.current < missions.length - 1) {
        state.current += 1;
        render();
    } else {
        renderCompletion();
        renderMissionMap();
        renderScores();
    }
}

function validateMission(mission) {
    const buttons = [...els.taskArea.querySelectorAll('.task-choice')];

    if (mission.type === 'choice') {
        if (state.selected.length !== 1) {
            if (els.aiMessage) els.aiMessage.textContent = 'Pilih satu avatar sebelum melanjutkan.';
            return false;
        }
        return true;
    }

    if (mission.type === 'quiz') {
        const selected = state.selected[0];
        buttons.forEach((button) => {
            if (button.textContent === mission.answer) button.classList.add('is-correct');
            if (button.textContent === selected && selected !== mission.answer) button.classList.add('is-wrong');
        });
        if (selected !== mission.answer) {
            if (els.aiMessage) els.aiMessage.textContent = `Belum tepat. ${mission.explanation}`;
            return false;
        }
        return true;
    }

    return false;
}

function addLog(message) {
    if (!els.logBox || !message) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    els.logBox.prepend(entry);
}

function renderScores() {
    const stats = { science: state.science, care: state.care, health: state.health };
    Object.entries(stats).forEach(([key, value]) => {
        const label = els[`stat${key.charAt(0).toUpperCase()}${key.slice(1)}`];
        const bar = els[`bar${key.charAt(0).toUpperCase()}${key.slice(1)}`];
        if (label) label.textContent = value;
        if (bar) bar.style.width = `${value}%`;
    });

    if (els.badgeRow) {
        els.badgeRow.innerHTML = '';
        visibleBadges.forEach((badge) => {
            const chip = document.createElement('span');
            chip.className = `badge-chip${state.badges.has(badge) ? ' is-earned' : ''}`;
            chip.textContent = badge;
            els.badgeRow.appendChild(chip);
        });
    }
}

function renderCompletion() {
    if (els.scoreSummary) {
        els.scoreSummary.textContent =
            `7 misi selesai · Ipak ${state.science} · Kepedulian ${state.care} · Kesehatan ${state.health} · Badge ${state.badges.size}`;
    }
    if (els.completionOverlay) els.completionOverlay.classList.remove('hidden');
}

function resetGame() {
    state.current = 0;
    state.unlocked = 0;
    state.completed = new Set();
    state.selected = [];
    state.science = 0;
    state.care = 0;
    state.health = 35;
    state.badges = new Set();
    if (els.logBox) els.logBox.innerHTML = '';
    if (els.completionOverlay) els.completionOverlay.classList.add('hidden');
    render();
}

if (els.actionButton) els.actionButton.addEventListener('click', completeCurrentMission);
if (els.resetButton) els.resetButton.addEventListener('click', resetGame);

addLog('Misi dimulai. Kerjakan Misi 1, pre-test, lalu subbab A–E pada Misi 2–6.');
render();
