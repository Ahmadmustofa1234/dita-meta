import { chapters, missions, avatars, pretestQuestions, missionPosttestQuestions, gradeAnswers } from './learning-data.js';
export { missions } from './learning-data.js';

    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const chapterById = (id) => chapters.find(chapter => chapter.id === id);
    const avatarIconMarkup = (avatar) => `<i class="${avatar.icon}" aria-hidden="true"></i>`;

function safeRandomUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function readAssessmentResponse(response) {
    const body = await response.text();
    try {
        return JSON.parse(body);
    } catch {
        throw new Error('Server assessment tidak tersedia. Buka game melalui http://localhost:3000 atau deploy bersama server.js, bukan melalui file HTML, Live Server, atau hosting statis.');
    }
}

const PENDING_SUBMISSIONS_KEY = 'ecoseaverse-pending-submissions-v1';

function readPendingSubmissions() {
    try {
        const raw = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writePendingSubmissions(items) {
    try {
        localStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(items));
    } catch {}
}

function queueOfflineSubmission(payload) {
    const pending = readPendingSubmissions();
    const filtered = pending.filter((item) => item?.attemptId !== payload.attemptId);
    filtered.push({ ...payload, queuedAt: new Date().toISOString() });
    writePendingSubmissions(filtered);
}

export async function syncPendingAssessmentSubmissions() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, remaining: readPendingSubmissions().length };
    const pending = readPendingSubmissions();
    if (pending.length === 0) return { synced: 0, remaining: 0 };

    const remaining = [];
    let synced = 0;
    for (const item of pending) {
        try {
            const response = await fetch('/api/mission-assessment-submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (response.ok) {
                synced += 1;
            } else if (response.status >= 500) {
                remaining.push(item);
            }
        } catch {
            remaining.push(item);
        }
    }
    writePendingSubmissions(remaining);
    return { synced, remaining: remaining.length };
}

async function submitAssessmentWithOfflineFallback(payload) {
    const isNativeCapacitor = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
    if (isNativeCapacitor || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        queueOfflineSubmission(payload);
        return { offlineQueued: true };
    }
    try {
        const response = await fetch('/api/mission-assessment-submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.status >= 500 || response.status === 404 || response.status === 405) {
            queueOfflineSubmission(payload);
            return { offlineQueued: true };
        }
        const saved = await readAssessmentResponse(response);
        if (!response.ok) {
            throw new Error(saved.error || `Server menolak assessment (HTTP ${response.status}).`);
        }
        return { offlineQueued: false, saved };
    } catch (error) {
        if (error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
            queueOfflineSubmission(payload);
            return { offlineQueued: true };
        }
        throw error;
    }
}

function materialCards(chapter) {
    return chapter.sections.map(section => `<section class="materi-card full-width">
        <h4>${escapeHtml(section.title)}</h4><p>${escapeHtml(section.text)}</p>
    </section>`).join('');
}

export function createLearningUI({ state, onComplete, onChange, onOpen, onClose, notify, speak }) {
    const el = id => document.getElementById(id);
    const popup = el('mission-popup');
    const taskArea = el('popup-task-area');
    const action = el('popup-action');
    const materiModal = el('materi-modal');
    const sessions = new Map();
    state.assessments ||= {};
    state.avatar ||= null;
    let activeKey = null;
    let selectedAvatar = null;
    let returnFocus = null;
    let materiReturnFocus = null;
    let activeChapter = 'A';

    function setAction(label, handler, disabled = false) {
        action.textContent = label;
        action.disabled = disabled;
        action.onclick = handler;
    }

    function showPopup() {
        if (popup.classList.contains('hidden')) returnFocus = document.activeElement;
        popup.classList.remove('hidden');
        onOpen();
        el('popup-title').focus({ preventScroll: true });
    }

    function close() {
        popup.classList.add('hidden');
        popup.classList.remove('chapter-pretest-active');
        popup.classList.remove('assessment-active');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        state.uiState = { modal: 'none' };
        onChange();
        returnFocus?.focus({ preventScroll: true });
        onClose();
    }

    function header(config, label, showMaterial = false) {
        el('popup-eyebrow').textContent = label;
        el('popup-title').textContent = config.title;
        el('popup-description').textContent = config.description;
        el('popup-ai-msg').textContent = config.ai;
        el('popup-char-text').textContent = 'Bab 6 · Ekologi dan Keanekaragaman Hayati Indonesia';
        const isAssessment = config.type === 'chapter-pretest' || config.type === 'chapter-posttest';
        popup.classList.toggle('assessment-active', isAssessment);
        popup.querySelector('.popup-ai-panel')?.classList.toggle('hidden', isAssessment);
        el('popup-char-value').classList.toggle('hidden', isAssessment);
        el('popup-points').textContent = config.type === 'chapter-pretest'
            ? `Pre-test · ${config.questions.length} soal`
            : config.type === 'chapter-posttest'
                ? `Post-test · ${config.questions.length} soal`
                : config.type === 'avatar'
                    ? 'Pilih avatar untuk membuka gerbang'
                    : `+${config.points} poin penyelesaian`;
        el('popup-materi-banner').classList.toggle('hidden', !showMaterial);
        if (showMaterial) {
            const chapter = chapterById(config.chapter);
            el('popup-materi-hint').textContent = `Subbab ${chapter.id} · ${chapter.title} · hlm. ${chapter.pages}.`;
            el('btn-popup-open-materi').onclick = () => openMateri(config.chapter);
        }
    }

    const avatarConfig = {
        title: 'Pilih Avatar Penjelajah',
        type: 'avatar',
        description: 'Pilih satu peran penjaga yang akan menemanimu mempelajari Bab 6: Ekologi dan Keanekaragaman Hayati Indonesia.',
        ai: 'Pilih peran penjagamu di Gerbang Laut Madura untuk membuka perjalanan.',
        points: 0
    };

    function openAvatar() {
        openMission(0);
    }

    function renderAvatar(missionIndex = null) {
        popup.classList.remove('pdf-reading');
        const config = missionIndex === null ? avatarConfig : missions[missionIndex];
        activeKey = 'avatar';
        selectedAvatar = state.avatar?.id || null;
        header(config, missionIndex === null ? 'Avatar Penjelajah' : `Misi ${missionIndex + 1} · Avatar`);
        el('popup-task-title').textContent = 'Pilih peran penjagamu';
        taskArea.innerHTML = '<div class="task-grid avatar-grid"></div>';
        const grid = taskArea.firstElementChild;
        avatars.forEach(avatar => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'task-choice avatar-choice';
            button.classList.toggle('is-selected', selectedAvatar === avatar.id);
            button.setAttribute('aria-pressed', String(selectedAvatar === avatar.id));
            button.innerHTML = `<span class="avatar-art" aria-hidden="true">${avatarIconMarkup(avatar)}</span><span><strong>${avatar.name}</strong><small>${avatar.detail}</small></span>`;
            button.onclick = () => {
                selectedAvatar = avatar.id;
                state.avatar = avatar;
                onChange();
                updateProgress();
                grid.querySelectorAll('button').forEach(other => {
                    other.classList.toggle('is-selected', other === button);
                    other.setAttribute('aria-pressed', String(other === button));
                });
                action.disabled = false;
            };
            grid.appendChild(button);
        });
        setAction('Simpan Avatar', () => {
            state.avatar = avatars.find(avatar => avatar.id === selectedAvatar);
            if (!state.avatar) return;
            onChange();
            updateProgress();
            if (missionIndex !== null) {
                if (!state.completed.has(missionIndex)) onComplete(missionIndex, null);
                taskArea.innerHTML = `<div class="assessment-result"><span class="avatar-art">${avatarIconMarkup(state.avatar)}</span><h4>${state.avatar.name}</h4><p>Peran penjaga tersimpan. Misi 1 selesai; Gerbang Laut Madura kini terbuka untuk perjalananmu.</p></div>`;
                const nextIndex = missionIndex + 1;
                setAction(`Cari Misi ${nextIndex + 1}`, () => {
                    close();
                    if (typeof window.pointCameraToMission === 'function') window.pointCameraToMission(nextIndex);
                    if (typeof window.showAiMessage === 'function') {
                        window.showAiMessage(`Selamat menjalankan peran ${state.avatar.name}! Misi 2 berada di laut. Ikuti suar cahaya untuk mempelajari Subbab A.`, true);
                    }
                });
                return;
            }
            taskArea.innerHTML = `<div class="assessment-result"><span class="avatar-art">${avatarIconMarkup(state.avatar)}</span><h4>${state.avatar.name}</h4><p>Peran penjaga tersimpan.</p></div>`;
            setAction('Kembali Menjelajah', () => {
                close();
            });
        }, !selectedAvatar);
    }

    function openMission(index) {
        if (!Number.isInteger(index) || !missions[index]) return;
        if (index > state.unlocked) {
            notify(`Selesaikan Misi ${state.unlocked + 1} terlebih dahulu.`);
            return;
        }
        if (index > 0 && !state.avatar) {
            notify('Pilih avatar terlebih dahulu di Misi 1 pada Gerbang Laut Madura.');
            return;
        }
        state.currentMission = index;
        activeKey = `mission-${index + 1}`;
        state.uiState = { modal: 'mission', missionIndex: index };
        onChange();
        const savedAssessment = state.assessments[activeKey];
        if (missions[index].type !== 'material' && savedAssessment && (savedAssessment.completed === true || Number.isInteger(savedAssessment.percent)) && !state.completed.has(index)) {
            onComplete(index, {
                correct: savedAssessment.correct ?? 0,
                total: savedAssessment.total || missions[index].questions?.length || 15,
                percent: savedAssessment.percent ?? 0
            });
        }
        if (missions[index].type === 'material') {
            const pretestKey = `mission-${index + 1}-pretest`;
            const posttestKey = `mission-${index + 1}-posttest`;
            const savedPretest = state.assessments[pretestKey];
            const savedPosttest = state.assessments[posttestKey];
            if (savedPosttest && (savedPosttest.completed === true || Number.isInteger(savedPosttest.percent)) && !state.completed.has(index)) {
                onComplete(index, {
                    correct: savedPosttest.correct ?? 0,
                    total: savedPosttest.total || chapterPosttestConfig(index).questions.length,
                    percent: savedPosttest.percent ?? 0
                });
            }
            if (state.completed.has(index)) {
                renderCompletedMission(index);
            } else if (savedPretest?.completed === true) {
                renderMaterialMission(index);
            } else {
                activeKey = pretestKey;
                sessions.set(activeKey, makeSession(chapterPretestConfig(index), index, activeKey));
                renderSession();
            }
            showPopup();
            return;
        }
        if (state.completed.has(index)) {
            renderCompletedMission(index);
            showPopup();
            return;
        }
        if (missions[index].type === 'avatar') {
            renderAvatar(index);
        } else {
            sessions.set(activeKey, makeSession(missions[index], index));
            renderSession();
        }
        showPopup();
        speak(missions[index].ai);
    }

    function chapterPretestConfig(index) {
        const mission = missions[index];
        const questions = pretestQuestions.filter(question => question.chapter === mission.chapter);
        if (questions.length !== 10) {
            throw new Error(`Pre-test Subbab ${mission.chapter} harus berisi tepat 10 soal; ditemukan ${questions.length}.`);
        }
        return {
            title: `Pre-test Subbab ${mission.chapter}`,
            type: 'chapter-pretest',
            chapter: mission.chapter,
            description: `Evaluasi awal sebelum membaca materi Subbab ${mission.chapter}.`,
            ai: '',
            questions
        };
    }

    function chapterPosttestConfig(index) {
        const mission = missions[index];
        const questions = missionPosttestQuestions[mission.chapter];
        if (!Array.isArray(questions) || !questions.length) {
            throw new Error(`Post-test Subbab ${mission.chapter} belum tersedia.`);
        }
        return {
            title: `Post-test Misi ${index + 1}`,
            type: 'chapter-posttest',
            chapter: mission.chapter,
            description: `Evaluasi setelah membaca materi Subbab ${mission.chapter}.`,
            ai: '',
            questions
        };
    }

    function makeSession(config, missionIndex, key = `mission-${missionIndex + 1}`) {
        const saved = state.assessments[key];
        const total = config.questions.length;
        const answers = Array(total).fill(null);
        if (Array.isArray(saved?.answers)) {
            saved.answers.slice(0, total).forEach((ans, i) => {
                if (Number.isInteger(ans) && ans >= 0 && ans < 4) answers[i] = ans;
            });
        }
        const hasAnyAnswer = answers.some(a => a !== null);
        const firstUnanswered = answers.indexOf(null);
        const savedCursor = Number.isInteger(saved?.cursor) && saved.cursor >= 0 && saved.cursor < total
            ? saved.cursor
            : (firstUnanswered !== -1 ? firstUnanswered : 0);
        const isCompletedResult = config.type === 'chapter-posttest' && saved && (saved.completed === true || Number.isInteger(saved.percent)) && answers.every(a => a !== null);
        return {
            config,
            missionIndex,
            assessmentKey: key,
            phase: isCompletedResult ? 'questions' : ((saved?.phase === 'questions' || hasAnyAnswer) ? 'questions' : 'intro'),
            cursor: savedCursor,
            answers,
            attemptId: saved?.attemptId || null,
            result: isCompletedResult ? {
                correct: saved.correct ?? 0,
                total: saved.total || total,
                percent: saved.percent ?? 0
            } : null
        };
    }

    function saveSessionDraft(session) {
        if (!session.assessmentKey || session.result) return;
        state.assessments[session.assessmentKey] = {
            ...(state.assessments[session.assessmentKey] || {}),
            completed: false,
            phase: session.phase,
            cursor: session.cursor,
            answers: [...session.answers],
            ...(session.attemptId ? { attemptId: session.attemptId } : {})
        };
        onChange();
    }

    function materialMarkup(config) {
        const chapter = chapterById(config.chapter);
        return `<p class="assessment-source">IPA Kelas VII · Bab 6${chapter.id} · hlm. ${chapter.pages}</p>
            <h4>${escapeHtml(chapter.title)}</h4>
            <p class="assessment-source">Baca PDF materi langsung di aplikasi. Tidak perlu mengunduh file untuk melanjutkan misi.</p>
            <nav class="mission-pdf-navigation" aria-label="Navigasi halaman PDF">
                <button type="button" data-pdf-page-step="-1" aria-label="Halaman sebelumnya" disabled>‹ Sebelumnya</button>
                <span data-pdf-page-label aria-live="polite">Halaman 1 dari ${chapter.pdfPages}</span>
                <button type="button" data-pdf-page-step="1" aria-label="Halaman berikutnya"${chapter.pdfPages <= 1 ? ' disabled' : ''}>Berikutnya ›</button>
                <button type="button" class="mission-pdf-chat-button" data-open-material-chat><i class="fa-solid fa-comments"></i> Tanya EcoBot</button>
                <button type="button" data-pdf-fullscreen aria-label="Besarkan pembaca PDF ke layar penuh">⛶ Layar Penuh</button>
            </nav>
            <div class="mission-pdf-reader">
                <iframe src="${escapeHtml(chapter.pdf)}#page=1&zoom=page-fit&toolbar=0" data-pdf-url="${escapeHtml(chapter.pdf)}" data-pdf-page="1" data-pdf-pages="${chapter.pdfPages}" title="PDF Subbab ${chapter.id}: ${escapeHtml(chapter.title)}" loading="eager"></iframe>
                <button type="button" class="mission-pdf-fullscreen-chat" data-open-material-chat><i class="fa-solid fa-comments"></i> Tanya EcoBot</button>
                <button type="button" class="mission-pdf-exit-fullscreen" data-pdf-exit-fullscreen aria-label="Keluar dari layar penuh">× Keluar Layar Penuh</button>
            </div>`;
    }

    function renderMaterialMission(index) {
        const config = missions[index];
        popup.classList.add('pdf-reading');
        popup.classList.remove('chapter-pretest-active');
        header(config, `Misi ${index + 1} · Materi`);
        el('popup-task-title').textContent = `Subbab ${config.chapter} · ${chapterById(config.chapter).short}`;
        taskArea.innerHTML = materialMarkup(config);
        setAction(`Selesai Membaca · Post-test ${chapterPosttestConfig(index).questions.length} Soal`, () => completeMaterial(index));
    }

    function completeMaterial(index) {
        popup.classList.remove('pdf-reading');
        activeKey = `mission-${index + 1}-posttest`;
        const session = makeSession(chapterPosttestConfig(index), index, activeKey);
        sessions.set(activeKey, session);
        renderSession();
    }

    function renderCompletedMission(index) {
        const config = missions[index];
        popup.classList.remove('chapter-pretest-active');
        if (config.type === 'avatar') {
            popup.classList.remove('pdf-reading');
            renderAvatar(index);
            return;
        }
        if (config.type === 'material') {
            popup.classList.add('pdf-reading');
            header(config, `Misi ${index + 1} · Selesai`);
            el('popup-task-title').textContent = `Subbab ${config.chapter} · ${chapterById(config.chapter).short}`;
            taskArea.innerHTML = `${materialMarkup(config)}<div class="assessment-result"><p>Misi ini sudah selesai. Kamu tetap dapat membaca ulang materinya.</p></div>`;
            setAction(index < missions.length - 1 ? `Berenang Cari Misi ${index + 2}` : 'Kembali Menjelajah', () => {
                close();
                if (index < missions.length - 1) {
                    if (typeof window.pointCameraToMission === 'function') window.pointCameraToMission(index + 1);
                    if (typeof window.showAiMessage === 'function') {
                        window.showAiMessage(`Berenanglah mencari suar cahaya Misi ${index + 2}: ${missions[index + 1].title}!`, true);
                    }
                }
            });
            return;
        }
        popup.classList.remove('pdf-reading');
        const saved = state.assessments[activeKey];
        if (saved?.answers) {
            sessions.set(activeKey, { ...makeSession(config, index), answers: [...saved.answers], result: { correct: saved.correct, total: saved.total, percent: saved.percent } });
            renderSession();
            return;
        }
        header(config, `Misi ${index + 1} · Selesai`);
        el('popup-task-title').textContent = 'Misi sudah selesai';
        taskArea.innerHTML = '<div class="assessment-result"><p>Misi ini telah tercatat selesai untuk peserta ini dan tidak perlu dikerjakan ulang pada pertemuan berikutnya.</p></div>';
        setAction('Kembali Menjelajah', close);
    }

    function renderSession() {
        popup.classList.remove('pdf-reading');
        const session = sessions.get(activeKey);
        const { config, missionIndex, phase } = session;
        popup.classList.toggle('chapter-pretest-active', config.type === 'chapter-pretest');
        header(config, `Misi ${missionIndex + 1}`);
        taskArea.innerHTML = '';
        if (session.result) {
            renderResult(session);
        } else if (phase === 'intro') {
            el('popup-task-title').textContent = 'Petunjuk pengerjaan';
            taskArea.innerHTML = config.type === 'chapter-pretest'
                ? `<div class="assessment-result"><p>Jawab 10 soal Pre-test Subbab ${config.chapter} sebelum membaca materi.</p><p>Pilih satu jawaban pada setiap soal. Jawaban tersimpan otomatis tanpa nilai atau pembahasan.</p></div>`
                : `<div class="assessment-result"><p>${config.questions.length} soal pilihan ganda setelah membaca materi.</p><p>Pilih satu jawaban pada setiap soal. Jawaban dan nilai post-test dikirim ke server serta tersimpan di dashboard admin.</p></div>`;
            setAction(config.type === 'chapter-pretest' ? `Mulai Pre-test Subbab ${config.chapter}` : 'Mulai Tes', () => {
                session.phase = 'questions';
                saveSessionDraft(session);
                renderSession();
                focusQuestion();
            });
        } else {
            renderQuestion(session);
        }
    }

    function focusQuestion() {
        el('popup-task-title').focus({ preventScroll: true });
        popup.querySelector('.mission-popup-inner').scrollTop = 0;
    }

    function renderQuestion(session) {
        const { config, cursor, answers } = session;
        const question = config.questions[cursor];
        el('popup-task-title').textContent = `Soal ${cursor + 1} dari ${config.questions.length} · Subbab ${question.chapter}`;
        taskArea.innerHTML = `<p class="assessment-progress" id="assessment-progress" aria-live="polite"></p>
            <p class="assessment-question" id="assessment-question">${escapeHtml(question.prompt)}</p>
            <div class="task-grid assessment-options" role="group" aria-labelledby="assessment-question"></div>
            <nav class="assessment-nav" aria-label="Navigasi soal"><button type="button" class="btn-secondary" id="question-prev">Soal Sebelumnya</button><span>Tersimpan otomatis · Jawaban dapat ditinjau sebelum dikumpulkan.</span></nav>`;
        const grid = taskArea.querySelector('.assessment-options');
        const updateSelection = () => {
            grid.querySelectorAll('button').forEach((button, i) => {
                button.classList.toggle('is-selected', answers[cursor] === i);
                button.setAttribute('aria-pressed', String(answers[cursor] === i));
            });
            el('assessment-progress').textContent = `${answers.filter(answer => answer !== null).length}/${config.questions.length} soal terjawab · Tersimpan otomatis`;
            action.disabled = answers[cursor] === null;
        };
        question.options.forEach((option, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'task-choice';
            button.textContent = `${String.fromCharCode(65 + i)}. ${option}`;
            button.onclick = () => {
                answers[cursor] = i;
                saveSessionDraft(session);
                updateSelection();
            };
            grid.appendChild(button);
        });
        el('question-prev').disabled = cursor === 0;
        el('question-prev').onclick = () => {
            session.cursor--;
            saveSessionDraft(session);
            renderSession();
            focusQuestion();
        };
        const isLast = cursor === config.questions.length - 1;
        setAction(isLast ? 'Kumpulkan Jawaban' : 'Soal Berikutnya', () => {
            if (isLast) {
                submit(session);
            } else {
                session.cursor++;
                saveSessionDraft(session);
                renderSession();
                focusQuestion();
            }
        });
        updateSelection();
    }

    async function submit(session) {
        if (session.result) return;
        if (session.config.type === 'chapter-pretest') {
            const unanswered = session.answers.indexOf(null);
            if (unanswered !== -1) {
                session.cursor = unanswered;
                saveSessionDraft(session);
                renderSession();
                el('popup-description').textContent = 'Jawab semua soal sebelum menyelesaikan pre-test.';
                return;
            }
            session.attemptId ||= state.assessments[session.assessmentKey]?.attemptId || safeRandomUUID();
            action.disabled = true;
            action.textContent = 'Menyimpan pre-test...';
            try {
                await submitAssessmentWithOfflineFallback({
                    attemptId: session.attemptId,
                    schoolName: state.schoolName,
                    participantName: state.participantName,
                    missionNumber: session.missionIndex + 1,
                    assessmentType: 'pretest',
                    answers: [...session.answers]
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
                el('popup-description').textContent = `Pre-test belum tersimpan ke server: ${message}`;
                action.disabled = false;
                action.textContent = 'Coba Kirim Jawaban Lagi';
                return;
            }
            state.assessments[session.assessmentKey] = {
                completed: true,
                answers: [...session.answers],
                phase: 'completed',
                cursor: session.cursor,
                attemptId: session.attemptId
            };
            onChange();
            updateProgress();
            renderMaterialMission(session.missionIndex);
            return;
        }
        let result;
        try {
            result = gradeAnswers(session.config.questions, session.answers);
        } catch (error) {
            session.cursor = session.answers.indexOf(null);
            saveSessionDraft(session);
            renderSession();
            el('popup-description').textContent = error.message;
            return;
        }
        if (session.config.type === 'chapter-posttest') {
            action.disabled = true;
            action.textContent = 'Mengirim hasil ke server...';
            try {
                session.attemptId ||= state.assessments[session.assessmentKey]?.attemptId || safeRandomUUID();
                saveSessionDraft(session);
                const outcome = await submitAssessmentWithOfflineFallback({
                    attemptId: session.attemptId,
                    schoolName: state.schoolName,
                    participantName: state.participantName,
                    missionNumber: session.missionIndex + 1,
                    assessmentType: 'posttest',
                    answers: [...session.answers]
                });
                if (!outcome.offlineQueued) {
                    const saved = outcome.saved;
                    if (!Number.isInteger(saved.correct) || saved.total !== session.config.questions.length || !Number.isInteger(saved.percent)) {
                        throw new Error('Server tidak mengembalikan nilai post-test yang valid.');
                    }
                    result = { correct: saved.correct, total: saved.total, percent: saved.percent };
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
                el('popup-description').textContent = `Hasil post-test belum tersimpan ke server: ${message} Jawabanmu sudah tersimpan otomatis di perangkat; coba kirim lagi.`;
                taskArea.querySelectorAll('button').forEach(button => { button.disabled = true; });
                action.disabled = false;
                action.textContent = 'Coba Kirim Jawaban Lagi';
                return;
            }
        }
        session.result = result;
        // Simpan hasil sebelum memanggil callback agar klik ganda tidak memberi poin ulang.
        state.assessments[session.assessmentKey] = {
            completed: true,
            ...session.result,
            answers: [...session.answers],
            ...(session.attemptId ? { attemptId: session.attemptId } : {})
        };
        if (session.missionIndex !== null) onComplete(session.missionIndex, session.result);
        onChange();
        updateProgress();
        renderSession();
        focusQuestion();
    }

    function renderResult(session) {
        const { config, result, answers, missionIndex } = session;
        el('popup-task-title').textContent = 'Hasil dan Pembahasan';
        el('popup-points').textContent = 'Poin penyelesaian sudah diberikan';
        el('popup-description').textContent = 'Baca pembahasan untuk memahami alasan jawaban yang benar. Nilai ini berasal dari jawaban yang kamu kumpulkan.';
        const rows = chapters.filter(chapter => config.questions.some(question => question.chapter === chapter.id)).map(chapter => {
            const questions = config.questions.map((question, i) => ({ question, i })).filter(item => item.question.chapter === chapter.id);
            const correct = questions.filter(({ question, i }) => answers[i] === question.answer).length;
            return `<li>Subbab ${chapter.id} · ${chapter.short}: <strong>${correct}/${questions.length}</strong></li>`;
        }).join('');
        taskArea.innerHTML = `<div class="assessment-result"><strong class="assessment-score">${result.percent}<small>/100</small></strong><p>${result.correct} dari ${result.total} jawaban benar</p><ul>${rows}</ul></div><h4 class="review-heading">Pembahasan seluruh soal</h4>`;
        config.questions.forEach((question, i) => {
            const correct = answers[i] === question.answer;
            const details = document.createElement('details');
            details.className = `question-review ${correct ? 'answer-correct' : 'answer-wrong'}`;
            details.innerHTML = `<summary>${i + 1}. ${correct ? 'Benar' : 'Perlu dipelajari'} — ${escapeHtml(question.prompt)}</summary>
                <p>Jawabanmu: <strong>${escapeHtml(question.options[answers[i]])}</strong></p>
                <p>Kunci jawaban: <strong>${escapeHtml(question.options[question.answer])}</strong></p>
                <p>${escapeHtml(question.explanation)}</p><small>Rujukan: Bab 6${question.chapter}, hlm. ${chapterById(question.chapter).pages}.</small>`;
            taskArea.appendChild(details);
        });
        if (missionIndex < missions.length - 1) {
            setAction(`Berenang Cari Misi ${missionIndex + 2}`, () => {
                close();
                if (typeof window.pointCameraToMission === 'function') window.pointCameraToMission(missionIndex + 1);
                if (typeof window.showAiMessage === 'function') {
                    window.showAiMessage(`Kuis Misi ${missionIndex + 1} selesai! Sekarang berenanglah keliling laut mencari suar cahaya Misi ${missionIndex + 2}: ${missions[missionIndex + 1].title}!`, true);
                }
            });
        } else {
            setAction('Selesai · Kembali Menjelajah', close);
        }
    }

    function updateProgress() {
        const participant = el('learner-participant');
        if (participant) participant.textContent = state.participantName ? `Peserta: ${state.participantName}` : 'Peserta belum masuk';
        el('learner-avatar').innerHTML = state.avatar
            ? `${avatarIconMarkup(state.avatar)} <span>${escapeHtml(state.avatar.name)}</span>`
            : 'Peran penjaga belum dipilih';
    }

    // Materi menggunakan sumber data yang sama dengan pemetaan misi A–E.
    el('materi-tabs').innerHTML = chapters.map(chapter => `<button type="button" class="materi-tab-btn" id="tab-${chapter.id}" data-tab="${chapter.id}" role="tab" aria-controls="materi-chapter-${chapter.id}"><span>${chapter.id}. ${chapter.short}</span></button>`).join('');
    el('materi-body').innerHTML = '<p id="materi-search-empty" class="hidden" role="status">Topik tidak ditemukan. Coba kata kunci lain.</p>' + chapters.map((chapter, i) => `<article class="materi-chapter hidden" id="materi-chapter-${chapter.id}" role="tabpanel" aria-labelledby="tab-${chapter.id}">
        <div class="materi-chapter-header"><span class="materi-chapter-tag">Bab 6${chapter.id} · hlm. ${chapter.pages}</span><h3>${chapter.id}. ${chapter.title}</h3><p>${chapter.objective}</p></div>
        ${materialCards(chapter)}<div class="materi-mission-callout"><div class="materi-callout-text"><strong>Misi ${i + 2} · Materi Subbab ${chapter.id}</strong><p>Pelajari materi ini langsung di Misi ${i + 2} saat menjelajah dunia laut.</p></div><button type="button" class="btn-materi-go-mission" data-mission-index="${i + 1}">Buka Misi ${i + 2}</button></div></article>`).join('');

    function switchChapter(id) {
        if (!chapterById(id)) return;
        activeChapter = id;
        el('materi-search-input').value = '';
        el('materi-search-empty').classList.add('hidden');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        el('btn-materi-tts').textContent = 'Dengarkan AI';
        el('materi-tabs').querySelectorAll('button').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === id);
            tab.setAttribute('aria-selected', String(tab.dataset.tab === id));
        });
        el('materi-body').querySelectorAll('article').forEach(article => article.classList.toggle('hidden', article.id !== `materi-chapter-${id}`));
        const index = chapters.findIndex(chapter => chapter.id === id);
        el('btn-materi-prev').disabled = index === 0;
        el('btn-materi-next').disabled = index === chapters.length - 1;
        el('materi-page-indicator').textContent = `Subbab ${id} · ${index + 1} dari 5`;
        el('materi-body').scrollTop = 0;
        if (materiModal && !materiModal.classList.contains('hidden')) {
            state.uiState = { modal: 'materi', chapter: id };
            onChange();
        }
    }

    function openMateri(id = 'A') {
        materiReturnFocus = document.activeElement;
        switchChapter(id);
        materiModal.classList.remove('hidden');
        state.uiState = { modal: 'materi', chapter: activeChapter };
        onChange();
        onOpen();
        el('materi-close').focus({ preventScroll: true });
    }

    function closeMateri() {
        materiModal.classList.add('hidden');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        state.uiState = !popup.classList.contains('hidden')
            ? { modal: 'mission', missionIndex: state.currentMission }
            : { modal: 'none' };
        onChange();
        materiReturnFocus?.focus({ preventScroll: true });
        if (popup.classList.contains('hidden')) onClose();
    }

    el('materi-tabs').addEventListener('click', event => {
        const tab = event.target.closest('[data-tab]');
        if (tab) switchChapter(tab.dataset.tab);
    });
    el('materi-body').addEventListener('click', event => {
        const button = event.target.closest('[data-mission-index]');
        if (!button) return;
        const targetIdx = Number(button.dataset.missionIndex);
        closeMateri();
        if (state.completed.has(targetIdx)) {
            openMission(targetIdx);
            return;
        }
        if (targetIdx > state.unlocked) {
            notify(`Selesaikan Misi ${state.unlocked + 1} terlebih dahulu.`);
            return;
        }
        if (typeof missions !== 'undefined' && missions[targetIdx]) {
            const targetPos = missions[targetIdx].position;
            const dist = typeof camera !== 'undefined' ? Math.round(camera.position.distanceTo(targetPos)) : 999;
            if (dist <= 22 || state.inZone === targetIdx) {
                openMission(targetIdx);
            } else {
                if (typeof window.pointCameraToMission === 'function') window.pointCameraToMission(targetIdx);
                if (typeof window.showAiMessage === 'function') {
                    window.showAiMessage(`Materi telah dipelajari! Sekarang berenanglah keliling laut mencari suar cahaya Misi ${targetIdx + 1}: ${missions[targetIdx].title} (jarak ${dist}m)!`, true);
                }
            }
        } else {
            openMission(targetIdx);
        }
    });
    el('btn-materi-prev').onclick = () => switchChapter(chapters[chapters.findIndex(chapter => chapter.id === activeChapter) - 1]?.id);
    el('btn-materi-next').onclick = () => switchChapter(chapters[chapters.findIndex(chapter => chapter.id === activeChapter) + 1]?.id);
    el('btn-materi-tts').onclick = () => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            el('btn-materi-tts').textContent = 'Dengarkan AI';
        } else {
            const chapter = chapterById(activeChapter);
            speak(`Subbab ${chapter.id}. ${chapter.title}. ${chapter.sections.map(section => section.text).join(' ')}`);
            el('btn-materi-tts').textContent = 'Hentikan AI';
        }
    };
    el('materi-search-input').addEventListener('input', event => {
        const query = event.target.value.trim().toLocaleLowerCase('id');
        if (!query) { switchChapter(activeChapter); return; }
        let matches = 0;
        el('materi-body').querySelectorAll('article').forEach(article => {
            const match = article.textContent.toLocaleLowerCase('id').includes(query);
            article.classList.toggle('hidden', !match);
            if (match) matches++;
        });
        el('materi-search-empty').classList.toggle('hidden', matches !== 0);
        el('materi-page-indicator').textContent = `${matches} subbab ditemukan`;
    });
    el('mission-close').onclick = close;
    el('btn-open-materi').onclick = () => openMateri();
    el('materi-close').onclick = closeMateri;
    el('materi-action-btn').onclick = closeMateri;
    taskArea.addEventListener('click', event => {
        const fullscreenButton = event.target.closest('[data-pdf-fullscreen], [data-pdf-exit-fullscreen]');
        if (fullscreenButton) {
            const reader = taskArea.querySelector('.mission-pdf-reader');
            const toggleFullscreen = async () => {
                if (!reader) return;
                if (fullscreenButton.hasAttribute('data-pdf-exit-fullscreen') || document.fullscreenElement === reader) {
                    await document.exitFullscreen();
                } else {
                    await reader.requestFullscreen();
                }
            };
            toggleFullscreen().catch(error => {
                console.warn('Pembaca PDF tidak dapat diubah ke layar penuh:', error);
                notify('Mode layar penuh tidak tersedia di browser ini.');
            });
            return;
        }

        const button = event.target.closest('[data-pdf-page-step]');
        if (!button) return;
        const reader = taskArea.querySelector('.mission-pdf-reader iframe');
        const pageLabel = taskArea.querySelector('[data-pdf-page-label]');
        if (!reader || !pageLabel) return;

        const totalPages = Number(reader.dataset.pdfPages);
        const currentPage = Number(reader.dataset.pdfPage);
        const nextPage = Math.min(totalPages, Math.max(1, currentPage + Number(button.dataset.pdfPageStep)));
        if (!Number.isInteger(totalPages) || !Number.isInteger(currentPage) || !Number.isInteger(nextPage) || nextPage === currentPage) return;

        reader.dataset.pdfPage = String(nextPage);
        reader.src = `${reader.dataset.pdfUrl}#page=${nextPage}&zoom=page-fit&toolbar=0`;
        pageLabel.textContent = `Halaman ${nextPage} dari ${totalPages}`;
        taskArea.querySelector('[data-pdf-page-step="-1"]').disabled = nextPage === 1;
        taskArea.querySelector('[data-pdf-page-step="1"]').disabled = nextPage === totalPages;
    });
    document.addEventListener('fullscreenchange', () => {
        const fullscreenButton = taskArea.querySelector('[data-pdf-fullscreen]');
        if (!fullscreenButton) return;
        const isFullscreen = document.fullscreenElement === taskArea.querySelector('.mission-pdf-reader');
        fullscreenButton.textContent = isFullscreen ? '× Keluar Layar Penuh' : '⛶ Layar Penuh';
        fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Keluar dari layar penuh' : 'Besarkan pembaca PDF ke layar penuh');
    });

    document.addEventListener('keydown', event => {
        const modal = !materiModal.classList.contains('hidden') ? materiModal : !popup.classList.contains('hidden') ? popup : null;
        if (!modal || !el('clam-modal').classList.contains('hidden')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            modal === materiModal ? closeMateri() : close();
        }
        if (event.key === 'Tab') {
            const focusable = [...modal.querySelectorAll('button:not([disabled]), input, summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
        }
    }, true);
    switchChapter('A');
    updateProgress();
    return { openMission, openAvatar, close, openMateri, closeMateri, switchChapter, refresh: updateProgress };
}
