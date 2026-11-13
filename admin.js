import { chapters, posttestQuestions, pretestQuestions, missionPosttestQuestions } from './learning-data.js';

const byId = id => document.getElementById(id);
const loginPanel = byId('login-panel');
const dashboard = byId('dashboard');
const status = byId('admin-status');
let allSubmissions = [];
let activeFilter = 'all';

async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Permintaan gagal (HTTP ${response.status}).`);
    return result;
}

function showLogin(configured) {
    dashboard.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    byId('setup-message').textContent = configured
        ? 'Masukkan password admin yang sudah diatur di environment server.'
        : 'Admin belum dikonfigurasi. Atur ADMIN_PASSWORD (minimal 12 karakter) dan ADMIN_SESSION_SECRET (minimal 32 karakter), lalu mulai ulang server.';
    byId('login-form').querySelector('button').disabled = !configured;
    byId('admin-password').disabled = !configured;
}

function updateOverview(submissions) {
    const pretests = submissions.filter(submission => submission.assessmentType !== 'posttest');
    const posttests = submissions.filter(submission => submission.assessmentType === 'posttest');
    const average = posttests.length
        ? Math.round(posttests.reduce((sum, submission) => sum + submission.percent, 0) / posttests.length)
        : null;
    byId('total-count').textContent = String(submissions.length);
    byId('pretest-count').textContent = String(pretests.length);
    byId('posttest-count').textContent = String(posttests.length);
    byId('average-score').textContent = average === null ? '—' : `${average}%`;
}

function renderSubmissions() {
    const container = byId('submissions');
    container.replaceChildren();
    const searchTerm = byId('submission-search').value.trim().toLocaleLowerCase('id');
    const submissions = allSubmissions.filter(submission => {
        const matchesFilter = activeFilter === 'all' || submission.assessmentType === activeFilter;
        const searchableText = `${submission.participantName} ${submission.schoolName || ''}`.toLocaleLowerCase('id');
        const matchesSearch = searchableText.includes(searchTerm);
        return matchesFilter && matchesSearch;
    });
    const limitLabel = allSubmissions.length === 500 ? ' · maksimum 500 pengiriman terbaru' : '';
    byId('submission-count').textContent = `Menampilkan ${submissions.length} dari ${allSubmissions.length} pengiriman${limitLabel}`;
    if (!submissions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const title = document.createElement('strong');
        const message = document.createElement('p');
        if (!allSubmissions.length) {
            title.textContent = 'Belum ada pengiriman evaluasi';
            message.textContent = 'Jawaban peserta akan muncul di sini setelah mereka mengirim pre-test atau post-test.';
        } else {
            title.textContent = 'Tidak ada hasil yang cocok';
            message.textContent = 'Coba ubah filter atau gunakan kata kunci pencarian yang lain.';
        }
        empty.append(title, message);
        container.appendChild(empty);
        return;
    }

    submissions.forEach(submission => {
        const details = document.createElement('details');
        details.className = 'submission';
        const summary = document.createElement('summary');
        const date = new Date(submission.submittedAt);
        const isPosttest = submission.assessmentType === 'posttest';
        const missionChapter = submission.missionNumber ? chapters[submission.missionNumber - 2] : null;
        const questions = missionChapter
            ? (isPosttest ? missionPosttestQuestions[missionChapter.id] : pretestQuestions.filter(question => question.chapter === missionChapter.id))
            : (isPosttest ? posttestQuestions : pretestQuestions);
        const assessmentLabel = `${isPosttest ? 'Post-test' : 'Pre-test'}${submission.missionNumber ? ` Misi ${submission.missionNumber}` : ''}`;
        const dateLabel = Number.isNaN(date.valueOf()) ? submission.submittedAt : date.toLocaleString('id-ID');
        const main = document.createElement('span');
        main.className = 'submission-main';
        const icon = document.createElement('span');
        icon.className = `assessment-icon${isPosttest ? ' posttest' : ''}`;
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = isPosttest ? '✓' : '◷';
        const identity = document.createElement('span');
        const participant = document.createElement('span');
        participant.className = 'participant';
        participant.textContent = submission.participantName;
        const meta = document.createElement('span');
        meta.className = 'submission-meta';
        [
            submission.schoolName || 'Sekolah belum dicatat (data lama)',
            dateLabel,
            `${submission.answers.length} jawaban`
        ].forEach((value, index) => {
            const text = document.createElement('span');
            if (index === 0) text.className = 'school-meta';
            text.textContent = value;
            meta.appendChild(text);
        });
        identity.append(participant, meta);
        main.append(icon, identity);

        const side = document.createElement('span');
        side.className = 'submission-side';
        const badge = document.createElement('span');
        badge.className = `assessment-badge${isPosttest ? ' posttest' : ''}`;
        badge.textContent = assessmentLabel;
        side.appendChild(badge);
        const score = document.createElement('span');
        score.className = 'score-badge';
        score.textContent = isPosttest ? `${submission.correct}/${submission.total} · ${submission.percent}%` : 'Tanpa nilai';
        side.appendChild(score);
        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '⌄';
        side.appendChild(chevron);
        summary.append(main, side);
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'submission-body';
        const list = document.createElement('ol');
        list.className = 'answers';
        submission.answers.forEach((answer, index) => {
            const question = questions[index];
            const item = document.createElement('li');
            item.className = 'answer-item';
            const prompt = document.createElement('p');
            prompt.className = 'question-line';
            const number = document.createElement('span');
            number.className = 'question-number';
            number.textContent = `SOAL ${String(index + 1).padStart(2, '0')}`;
            prompt.appendChild(number);
            const promptText = document.createElement('span');
            promptText.textContent = question?.prompt || `Soal ${index + 1}`;
            prompt.appendChild(promptText);
            const chosen = document.createElement('p');
            chosen.className = 'answer-line';
            chosen.textContent = `Jawaban peserta: ${String.fromCharCode(65 + answer)}. ${question?.options[answer] || 'Pilihan tidak tersedia'}`;
            if (isPosttest && question) {
                const correctAnswer = document.createElement('p');
                correctAnswer.className = 'key-line';
                correctAnswer.textContent = `Kunci jawaban: ${String.fromCharCode(65 + question.answer)}. ${question.options[question.answer]}`;
                const explanation = document.createElement('p');
                explanation.className = 'explanation-line';
                explanation.textContent = question.explanation;
                item.append(prompt, chosen, correctAnswer, explanation);
            } else {
                item.append(prompt, chosen);
            }
            list.appendChild(item);
        });
        body.appendChild(list);
        details.appendChild(body);
        container.appendChild(details);
    });
}

async function loadSubmissions() {
    status.textContent = 'Mengambil hasil evaluasi...';
    const data = await request('/api/admin/assessment-submissions');
    allSubmissions = data.submissions;
    updateOverview(allSubmissions);
    renderSubmissions();
    status.textContent = '';
}

async function checkSession() {
    try {
        const data = await request('/api/admin/session');
        if (!data.configured) {
            showLogin(false);
            status.textContent = 'Akses admin belum aktif.';
        } else if (data.authenticated) {
            loginPanel.classList.add('hidden');
            dashboard.classList.remove('hidden');
            await loadSubmissions();
        } else {
            showLogin(true);
            status.textContent = '';
        }
    } catch (error) {
        showLogin(false);
        status.textContent = error.message;
    }
}

byId('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = byId('login-form').querySelector('button');
    button.disabled = true;
    status.textContent = 'Memeriksa password...';
    try {
        await request('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: byId('admin-password').value })
        });
        byId('admin-password').value = '';
        await checkSession();
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

byId('refresh-button').addEventListener('click', () => {
    loadSubmissions().catch(error => { status.textContent = error.message; });
});

byId('submission-search').addEventListener('input', renderSubmissions);
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll('.filter-button').forEach(filterButton => {
            filterButton.setAttribute('aria-pressed', String(filterButton === button));
        });
        renderSubmissions();
    });
});

byId('logout-button').addEventListener('click', async () => {
    try {
        await request('/api/admin/logout', { method: 'POST' });
        showLogin(true);
        status.textContent = 'Anda sudah keluar.';
    } catch (error) {
        status.textContent = error.message;
    }
});

checkSession();
