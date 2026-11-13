import { chapters, missions, avatars, pretestQuestions, gradeAnswers } from './learning-data.js';
export { missions } from './learning-data.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const chapterById = (id) => chapters.find(chapter => chapter.id === id);

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
    state.assessments = {};
    state.avatar = null;
    let activeKey = null;
    let selectedAvatar = null;
    let returnFocus = null;
    let materiReturnFocus = null;
    let activeChapter = 'A';

    const pretest = {
        title: 'Pre-test Bab 6', type: 'pretest', questions: pretestQuestions,
        description: 'Evaluasi awal sebelum Misi 2–6: 15 soal, masing-masing tiga soal dari subbab A–E.',
        ai: 'Jawablah berdasarkan pengetahuan awalmu. Nilai berapa pun dapat dilanjutkan ke materi. Pembahasan muncul setelah semua jawaban dikumpulkan.'
    };

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
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        returnFocus?.focus({ preventScroll: true });
        onClose();
    }

    function header(config, label, showMaterial = false) {
        el('popup-eyebrow').textContent = label;
        el('popup-title').textContent = config.title;
        el('popup-description').textContent = config.description;
        el('popup-ai-msg').textContent = config.ai;
        el('popup-char-text').textContent = 'Bab 6 · Ekologi dan Keanekaragaman Hayati Indonesia';
        el('popup-points').textContent = config.type === 'pretest' ? 'Evaluasi awal · di luar 7 misi' : `+${config.points} poin penyelesaian`;
        el('popup-materi-banner').classList.toggle('hidden', !showMaterial);
        if (showMaterial) {
            const chapter = chapterById(config.chapter);
            el('popup-materi-hint').textContent = `Subbab ${chapter.id} · ${chapter.title} · hlm. ${chapter.pages}.`;
            el('btn-popup-open-materi').onclick = () => openMateri(config.chapter);
        }
    }

    function renderAvatar() {
        header(missions[0], 'Misi 1 · Avatar');
        el('popup-task-title').textContent = 'Pilih avatar penjelajahmu';
        taskArea.innerHTML = '<div class="task-grid avatar-grid"></div>';
        const grid = taskArea.firstElementChild;
        avatars.forEach(avatar => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'task-choice avatar-choice';
            button.classList.toggle('is-selected', selectedAvatar === avatar.id);
            button.setAttribute('aria-pressed', String(selectedAvatar === avatar.id));
            button.innerHTML = `<span class="avatar-art" aria-hidden="true">${avatar.icon}</span><span><strong>${avatar.name}</strong><small>${avatar.detail}</small></span>`;
            button.onclick = () => {
                selectedAvatar = avatar.id;
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
            onComplete(0, null);
            updateProgress();
            taskArea.innerHTML = `<div class="assessment-result"><span class="avatar-art">${state.avatar.icon}</span><h4>${state.avatar.name}</h4><p>Avatar tersimpan. Lanjutkan ke pre-test sebelum mempelajari subbab A–E.</p></div>`;
            setAction(state.assessments.pretest ? 'Lanjut ke Misi 2' : 'Mulai Pre-test', () => state.assessments.pretest ? openMission(1) : openPretest());
        }, !selectedAvatar);
    }

    function openMission(index) {
        if (!Number.isInteger(index) || !missions[index]) return;
        if (index > state.unlocked) {
            notify(`Selesaikan Misi ${state.unlocked + 1} terlebih dahulu.`);
            return;
        }
        if (index > 0 && !state.assessments.pretest) {
            openPretest();
            return;
        }
        state.currentMission = index;
        activeKey = `mission-${index + 1}`;
        if (index === 0) {
            selectedAvatar = state.avatar?.id || null;
            renderAvatar();
        } else {
            if (!sessions.has(activeKey)) sessions.set(activeKey, makeSession(missions[index], index));
            renderSession();
        }
        showPopup();
        speak(missions[index].ai);
    }

    function openPretest() {
        if (!state.completed.has(0)) {
            notify('Pilih avatar pada Misi 1 terlebih dahulu, lalu mulai pre-test.');
            return;
        }
        activeKey = 'pretest';
        if (!sessions.has(activeKey)) sessions.set(activeKey, makeSession(pretest, null));
        renderSession();
        showPopup();
        speak(pretest.ai);
    }

    function makeSession(config, missionIndex) {
        return { config, missionIndex, phase: config.type === 'lesson' ? 'material' : 'intro', cursor: 0, answers: Array(config.questions.length).fill(null), result: null };
    }

    function renderSession() {
        const session = sessions.get(activeKey);
        const { config, missionIndex, phase } = session;
        header(config, missionIndex === null ? 'Evaluasi awal · Pre-test' : `Misi ${missionIndex + 1}`, config.type === 'lesson');
        taskArea.innerHTML = '';
        if (session.result) {
            renderResult(session);
        } else if (phase === 'material') {
            const chapter = chapterById(config.chapter);
            el('popup-task-title').textContent = `Pelajari subbab ${chapter.id} terlebih dahulu`;
            taskArea.innerHTML = `<p class="assessment-source">IPA Kelas VII · Bab 6${chapter.id} · hlm. ${chapter.pages}</p>${materialCards(chapter)}`;
            setAction(`Mulai ${config.questions.length} Soal`, () => { session.phase = 'questions'; renderSession(); focusQuestion(); });
        } else if (phase === 'intro') {
            el('popup-task-title').textContent = 'Petunjuk pengerjaan';
            taskArea.innerHTML = `<div class="assessment-result"><p>15 soal pilihan ganda, masing-masing 3 soal untuk subbab A, B, C, D, dan E.</p><p>Pilih satu jawaban pada setiap soal. Kamu dapat meninjau jawaban sebelum mengumpulkan. Nilai dan pembahasan ditampilkan setelah seluruh soal dijawab.</p><p>Jawaban tersimpan selama halaman ini tetap terbuka. Nilai pertama menjadi hasil evaluasi; membuka kembali tes menampilkan hasil yang sama.</p></div>`;
            setAction('Mulai Tes', () => { session.phase = 'questions'; renderSession(); focusQuestion(); });
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
            <nav class="assessment-nav" aria-label="Navigasi soal"><button type="button" class="btn-secondary" id="question-prev">Soal Sebelumnya</button><span>Jawaban dapat ditinjau sebelum dikumpulkan.</span></nav>`;
        const grid = taskArea.querySelector('.assessment-options');
        const updateSelection = () => {
            grid.querySelectorAll('button').forEach((button, i) => {
                button.classList.toggle('is-selected', answers[cursor] === i);
                button.setAttribute('aria-pressed', String(answers[cursor] === i));
            });
            el('assessment-progress').textContent = `${answers.filter(answer => answer !== null).length}/${config.questions.length} soal terjawab`;
            action.disabled = answers[cursor] === null;
        };
        question.options.forEach((option, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'task-choice';
            button.textContent = `${String.fromCharCode(65 + i)}. ${option}`;
            button.onclick = () => { answers[cursor] = i; updateSelection(); };
            grid.appendChild(button);
        });
        el('question-prev').disabled = cursor === 0;
        el('question-prev').onclick = () => { session.cursor--; renderSession(); focusQuestion(); };
        const isLast = cursor === config.questions.length - 1;
        setAction(isLast ? 'Kumpulkan Jawaban' : 'Soal Berikutnya', () => {
            if (isLast) submit(session);
            else { session.cursor++; renderSession(); focusQuestion(); }
        });
        updateSelection();
    }

    function submit(session) {
        if (session.result) return;
        try {
            session.result = gradeAnswers(session.config.questions, session.answers);
        } catch (error) {
            session.cursor = session.answers.indexOf(null);
            renderSession();
            el('popup-ai-msg').textContent = error.message;
            return;
        }
        // Simpan hasil sebelum memanggil callback agar klik ganda tidak memberi poin ulang.
        state.assessments[activeKey] = { ...session.result, answers: [...session.answers] };
        if (session.missionIndex !== null) onComplete(session.missionIndex, session.result);
        onChange();
        updateProgress();
        renderSession();
        focusQuestion();
    }

    function renderResult(session) {
        const { config, result, answers, missionIndex } = session;
        el('popup-task-title').textContent = 'Hasil dan Pembahasan';
        el('popup-points').textContent = missionIndex === null ? 'Pre-test selesai' : 'Poin penyelesaian sudah diberikan';
        el('popup-ai-msg').textContent = 'Baca pembahasan untuk memahami alasan jawaban yang benar. Nilai ini berasal dari jawaban yang kamu kumpulkan.';
        const rows = chapters.filter(chapter => config.questions.some(question => question.chapter === chapter.id)).map(chapter => {
            const questions = config.questions.map((question, i) => ({ question, i })).filter(item => item.question.chapter === chapter.id);
            const correct = questions.filter(({ question, i }) => answers[i] === question.answer).length;
            return `<li>Subbab ${chapter.id} · ${chapter.short}: <strong>${correct}/${questions.length}</strong></li>`;
        }).join('');
        const pre = state.assessments.pretest;
        const difference = pre ? result.percent - pre.percent : 0;
        const comparison = config.type === 'posttest' && pre ? `<p class="assessment-comparison">Pre-test: <strong>${pre.percent}/100</strong> → Post-test: <strong>${result.percent}/100</strong><br>Selisih: ${difference > 0 ? '+' : ''}${difference} poin persentase. Paket soal berbeda dengan cakupan subbab yang sama.</p>` : '';
        taskArea.innerHTML = `<div class="assessment-result"><strong class="assessment-score">${result.percent}<small>/100</small></strong><p>${result.correct} dari ${result.total} jawaban benar</p>${comparison}<ul>${rows}</ul></div><h4 class="review-heading">Pembahasan seluruh soal</h4>`;
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
        if (missionIndex === null) setAction('Lanjut ke Misi 2', () => openMission(1));
        else if (missionIndex < missions.length - 1) setAction(`Lanjut ke Misi ${missionIndex + 2}`, () => openMission(missionIndex + 1));
        else setAction('Selesai · Kembali Menjelajah', close);
    }

    function updateProgress() {
        el('learner-avatar').textContent = state.avatar ? `${state.avatar.icon} ${state.avatar.name}` : 'Avatar belum dipilih';
        const button = el('btn-pretest');
        button.disabled = !state.completed.has(0);
        button.textContent = state.assessments.pretest ? `Hasil Pre-test · ${state.assessments.pretest.percent}/100` : 'Pre-test Bab 6 · 15 soal';
        const mobileButton = el('mob-btn-pretest');
        if (mobileButton) {
            mobileButton.disabled = button.disabled;
            mobileButton.title = button.disabled ? 'Pilih avatar pada Misi 1 terlebih dahulu' : button.textContent;
        }
    }

    // Materi menggunakan sumber data yang sama dengan pemetaan misi A–E.
    el('materi-tabs').innerHTML = chapters.map(chapter => `<button type="button" class="materi-tab-btn" id="tab-${chapter.id}" data-tab="${chapter.id}" role="tab" aria-controls="materi-chapter-${chapter.id}"><span>${chapter.id}. ${chapter.short}</span></button>`).join('');
    el('materi-body').innerHTML = '<p id="materi-search-empty" class="hidden" role="status">Topik tidak ditemukan. Coba kata kunci lain.</p>' + chapters.map((chapter, i) => `<article class="materi-chapter hidden" id="materi-chapter-${chapter.id}" role="tabpanel" aria-labelledby="tab-${chapter.id}">
        <div class="materi-chapter-header"><span class="materi-chapter-tag">Bab 6${chapter.id} · hlm. ${chapter.pages}</span><h3>${chapter.id}. ${chapter.title}</h3><p>${chapter.objective}</p></div>
        ${materialCards(chapter)}<div class="materi-mission-callout"><div class="materi-callout-text"><strong>Misi ${i + 2} · 10 soal</strong><p>Soal khusus subbab ${chapter.id}, berbeda dari paket misi lainnya.</p></div><button type="button" class="btn-materi-go-mission" data-mission-index="${i + 1}">Kerjakan Misi ${i + 2}</button></div></article>`).join('');

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
    }

    function openMateri(id = 'A') {
        materiReturnFocus = document.activeElement;
        switchChapter(id);
        materiModal.classList.remove('hidden');
        onOpen();
        el('materi-close').focus({ preventScroll: true });
    }

    function closeMateri() {
        materiModal.classList.add('hidden');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
        closeMateri();
        openMission(Number(button.dataset.missionIndex));
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
    el('btn-pretest').onclick = openPretest;
    el('mob-btn-pretest').onclick = openPretest;
    el('btn-open-materi').onclick = () => openMateri();
    el('materi-close').onclick = closeMateri;
    el('materi-action-btn').onclick = closeMateri;

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
    return { openMission, openPretest, close, openMateri, closeMateri, switchChapter };
}
