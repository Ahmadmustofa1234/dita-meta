const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const learningData = import('./learning-data.js');

if (fs.existsSync(path.join(__dirname, '.env'))) {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PRIVATE_DIR = path.join(ROOT, '.private');
const DATABASE_PATH = process.env.PRETEST_DB_PATH || path.join(PRIVATE_DIR, 'pretest.sqlite');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const SESSION_COOKIE = 'ecoseaverse_admin_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const QUESTION_COUNT = 50;
const QUESTION_SET = 'bab6-a-e-50-v1';
const POSTTEST_QUESTION_COUNT = 15;
const POSTTEST_QUESTION_SET = 'bab6-posttest-15-v1';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

if (ADMIN_PASSWORD.length < 12) {
  console.warn('Admin dashboard belum aktif. Atur ADMIN_PASSWORD minimal 12 karakter sebelum login admin.');
}

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
const database = new Database(DATABASE_PATH);
database.pragma('journal_mode = WAL');
database.pragma('busy_timeout = 5000');
database.exec(`
  CREATE TABLE IF NOT EXISTS pretest_submissions (
    attempt_id TEXT PRIMARY KEY,
    participant_name TEXT NOT NULL,
    school_name TEXT NOT NULL DEFAULT '',
    answers_json TEXT NOT NULL,
     question_set TEXT NOT NULL,
     assessment_type TEXT NOT NULL DEFAULT 'pretest',
     mission_number INTEGER,
     correct_count INTEGER,
    score_percent INTEGER,
    submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pretest_submissions_submitted_at
    ON pretest_submissions(submitted_at DESC);
`);
const submissionColumns = new Set(database.pragma('table_info(pretest_submissions)').map(column => column.name));
if (!submissionColumns.has('school_name')) {
  database.exec("ALTER TABLE pretest_submissions ADD COLUMN school_name TEXT NOT NULL DEFAULT ''");
}
if (!submissionColumns.has('assessment_type')) {
    database.exec("ALTER TABLE pretest_submissions ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'pretest'");
}
if (!submissionColumns.has('mission_number')) {
    database.exec('ALTER TABLE pretest_submissions ADD COLUMN mission_number INTEGER');
}
if (!submissionColumns.has('correct_count')) {
  database.exec('ALTER TABLE pretest_submissions ADD COLUMN correct_count INTEGER');
}
if (!submissionColumns.has('score_percent')) {
  database.exec('ALTER TABLE pretest_submissions ADD COLUMN score_percent INTEGER');
}

database.exec(`
  CREATE TABLE IF NOT EXISTS participant_progress (
    participant_id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    progress_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

function isAdminConfigured() {
  return ADMIN_PASSWORD.length >= 12 && ADMIN_SESSION_SECRET.length >= 32;
}

function safeEqual(left, right) {
  const leftBuffer = crypto.createHash('sha256').update(left).digest();
  const rightBuffer = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSignature(timestamp) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(timestamp).digest('hex');
}

function hasValidAdminSession(req) {
  if (!isAdminConfigured()) return false;
  const token = req.cookies?.[SESSION_COOKIE] || parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!token) return false;
  const separator = token.indexOf('.');
  if (separator < 1) return false;
  const timestamp = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || Date.now() - issuedAt < 0 || Date.now() - issuedAt > SESSION_MAX_AGE_MS) return false;
  return safeEqual(signature, sessionSignature(timestamp));
}

function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    const key = part.slice(0, separator).trim();
    try {
      return [key, decodeURIComponent(part.slice(separator + 1).trim())];
    } catch {
      return [key, ''];
    }
  }).filter(([key]) => key));
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Origin permintaan tidak valid.' });
  }
  if (originHost !== req.get('host')) return res.status(403).json({ error: 'Permintaan lintas origin ditolak.' });
  return next();
}

function requireAdmin(req, res, next) {
  if (!hasValidAdminSession(req)) return res.status(401).json({ error: 'Login admin diperlukan.' });
  return next();
}

function getLoginAttempt(ip) {
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt <= Date.now()) {
    const fresh = { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, fresh);
    return fresh;
  }
  return current;
}

app.post('/api/admin/login', requireSameOrigin, (req, res) => {
  if (!isAdminConfigured()) {
    return res.status(503).json({ error: 'Admin belum dikonfigurasi. Atur ADMIN_PASSWORD dan ADMIN_SESSION_SECRET di environment server.' });
  }
  const attempt = getLoginAttempt(req.ip);
  if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    attempt.count++;
    return res.status(401).json({ error: 'Password admin salah.' });
  }
  loginAttempts.delete(req.ip);
  const timestamp = String(Date.now());
  res.cookie(SESSION_COOKIE, `${timestamp}.${sessionSignature(timestamp)}`, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  });
  return res.json({ authenticated: true });
});

app.post('/api/admin/logout', requireSameOrigin, (req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/' });
  return res.json({ authenticated: false });
});

app.post('/api/pretest-submissions', requireSameOrigin, (req, res, next) => {
  const { attemptId, schoolName, participantName, answers } = req.body || {};
  const validId = typeof attemptId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId);
  const school = typeof schoolName === 'string' ? schoolName.trim().replace(/\s+/g, ' ') : '';
  const name = typeof participantName === 'string' ? participantName.trim().replace(/\s+/g, ' ') : '';
  const validAnswers = Array.isArray(answers) &&
    answers.length === QUESTION_COUNT &&
    answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer <= 3);
  if (!validId || school.length < 1 || school.length > 100 || name.length < 1 || name.length > 40 || !validAnswers) {
    return res.status(400).json({ error: 'Data pre-test tidak valid. Pastikan nama sekolah, nama siswa, dan seluruh 50 jawaban sudah terisi.' });
  }

  const serializedAnswers = JSON.stringify(answers);
  try {
    const existing = database.prepare('SELECT participant_name, school_name, answers_json, question_set, assessment_type FROM pretest_submissions WHERE attempt_id = ?').get(attemptId);
    if (existing) {
      if (existing.participant_name !== name || existing.answers_json !== serializedAnswers || existing.question_set !== QUESTION_SET || existing.assessment_type !== 'pretest' || (existing.school_name && existing.school_name !== school)) {
        return res.status(409).json({ error: 'ID percobaan sudah digunakan dengan data yang berbeda.' });
      }
      if (!existing.school_name) {
        database.prepare('UPDATE pretest_submissions SET school_name = ? WHERE attempt_id = ?').run(school, attemptId);
      }
      return res.status(200).json({ saved: true, duplicate: true });
    }
    database.prepare(`
      INSERT INTO pretest_submissions (attempt_id, participant_name, school_name, answers_json, question_set, assessment_type)
      VALUES (?, ?, ?, ?, ?, 'pretest')
    `).run(attemptId, name, school, serializedAnswers, QUESTION_SET);
    return res.status(201).json({ saved: true });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/posttest-submissions', requireSameOrigin, async (req, res, next) => {
  const { attemptId, schoolName, participantName, answers } = req.body || {};
  const validId = typeof attemptId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId);
  const school = typeof schoolName === 'string' ? schoolName.trim().replace(/\s+/g, ' ') : '';
  const name = typeof participantName === 'string' ? participantName.trim().replace(/\s+/g, ' ') : '';
  const validAnswers = Array.isArray(answers) &&
    answers.length === POSTTEST_QUESTION_COUNT &&
    answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer <= 3);
  if (!validId || school.length < 1 || school.length > 100 || name.length < 1 || name.length > 40 || !validAnswers) {
    return res.status(400).json({ error: 'Data post-test tidak valid. Pastikan nama sekolah, nama siswa, dan seluruh 15 jawaban sudah terisi.' });
  }

  try {
    const { posttestQuestions, gradeAnswers } = await learningData;
    const result = gradeAnswers(posttestQuestions, answers);
    const serializedAnswers = JSON.stringify(answers);
    const existing = database.prepare(`
      SELECT participant_name, school_name, answers_json, question_set, assessment_type, correct_count, score_percent
      FROM pretest_submissions WHERE attempt_id = ?
    `).get(attemptId);
    if (existing) {
      if (existing.participant_name !== name ||
          existing.answers_json !== serializedAnswers ||
          existing.question_set !== POSTTEST_QUESTION_SET ||
          existing.assessment_type !== 'posttest' ||
          (existing.school_name && existing.school_name !== school)) {
        return res.status(409).json({ error: 'ID percobaan sudah digunakan dengan data yang berbeda.' });
      }
      if (!existing.school_name) {
        database.prepare('UPDATE pretest_submissions SET school_name = ? WHERE attempt_id = ?').run(school, attemptId);
      }
      return res.status(200).json({ saved: true, duplicate: true, correct: existing.correct_count, total: POSTTEST_QUESTION_COUNT, percent: existing.score_percent });
    }

    database.prepare(`
      INSERT INTO pretest_submissions
        (attempt_id, participant_name, school_name, answers_json, question_set, assessment_type, correct_count, score_percent)
      VALUES (?, ?, ?, ?, ?, 'posttest', ?, ?)
    `).run(attemptId, name, school, serializedAnswers, POSTTEST_QUESTION_SET, result.correct, result.percent);
    return res.status(201).json({ saved: true, correct: result.correct, total: result.total, percent: result.percent });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/mission-assessment-submissions', requireSameOrigin, async (req, res, next) => {
  const { attemptId, schoolName, participantName, missionNumber, assessmentType, answers } = req.body || {};
  const validId = typeof attemptId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId);
  const school = normalizeParticipantText(schoolName);
  const name = normalizeParticipantText(participantName);
  const mission = Number.isInteger(missionNumber) && missionNumber >= 2 && missionNumber <= 6 ? missionNumber : null;
  const type = assessmentType === 'pretest' || assessmentType === 'posttest' ? assessmentType : null;
  if (!validId || !school || school.length > 100 || !name || name.length > 40 || !mission || !type) {
    return res.status(400).json({ error: 'Data assessment misi tidak valid.' });
  }

  try {
    const { chapters, pretestQuestions, missionPosttestQuestions, gradeAnswers } = await learningData;
    const chapter = chapters[mission - 2];
    const questions = type === 'pretest'
      ? pretestQuestions.filter(question => question.chapter === chapter?.id)
      : missionPosttestQuestions[chapter?.id];
    const validAnswers = Array.isArray(questions) && Array.isArray(answers) &&
      answers.length === questions.length &&
      answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer <= 3);
    if (!validAnswers) {
      return res.status(400).json({ error: `Semua ${questions?.length || 0} jawaban ${type === 'pretest' ? 'pre-test' : 'post-test'} Misi ${mission} wajib diisi.` });
    }

    const questionSet = `bab6-misi-${mission}-${type}-v1`;
    const serializedAnswers = JSON.stringify(answers);
    const result = type === 'posttest' ? gradeAnswers(questions, answers) : null;
    const existing = database.prepare(`
      SELECT participant_name, school_name, answers_json, question_set, assessment_type, mission_number, correct_count, score_percent
      FROM pretest_submissions WHERE attempt_id = ?
    `).get(attemptId);
    if (existing) {
      if (existing.participant_name !== name || existing.answers_json !== serializedAnswers ||
          existing.question_set !== questionSet || existing.assessment_type !== type ||
          existing.mission_number !== mission || (existing.school_name && existing.school_name !== school)) {
        return res.status(409).json({ error: 'ID percobaan sudah digunakan dengan data yang berbeda.' });
      }
      if (!existing.school_name) database.prepare('UPDATE pretest_submissions SET school_name = ? WHERE attempt_id = ?').run(school, attemptId);
      return res.status(200).json({
        saved: true,
        duplicate: true,
        ...(result ? { correct: existing.correct_count, total: questions.length, percent: existing.score_percent } : {})
      });
    }

    database.prepare(`
      INSERT INTO pretest_submissions
        (attempt_id, participant_name, school_name, answers_json, question_set, assessment_type, mission_number, correct_count, score_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId, name, school, serializedAnswers, questionSet, type, mission,
      result?.correct ?? null, result?.percent ?? null
    );
    return res.status(201).json({
      saved: true,
      ...(result ? { correct: result.correct, total: result.total, percent: result.percent } : {})
    });
  } catch (error) {
    return next(error);
  }
});

function normalizeParticipantText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function makeParticipantKey(schoolName, participantName) {
  return `${normalizeParticipantText(schoolName).toLocaleLowerCase('id')}::${normalizeParticipantText(participantName).toLocaleLowerCase('id')}`;
}

function migrateParticipantProgress(progress) {
  if (!progress || progress.schema >= 4) return progress;
  const oldAssessments = progress.assessments && typeof progress.assessments === 'object' ? progress.assessments : {};
  const assessments = {};
  if (progress.schema === 3) {
    for (let missionNumber = 2; missionNumber <= 6; missionNumber++) {
      const oldAssessment = oldAssessments[`mission-${missionNumber}`];
      if (oldAssessment?.chapterPretestCompleted === true) {
        assessments[`mission-${missionNumber}-pretest`] = {
          completed: true,
          phase: 'completed',
          cursor: oldAssessment.cursor ?? 0,
          answers: Array.isArray(oldAssessment.answers) ? oldAssessment.answers : [],
          ...(oldAssessment.attemptId ? { attemptId: oldAssessment.attemptId } : {})
        };
      }
    }
  }

  return {
    ...progress,
    schema: 4,
    completed: progress.avatar ? [0] : [],
    assessments,
    currentMission: progress.avatar ? 1 : 0,
    unlocked: progress.avatar ? 1 : 0,
    science: 0,
    care: 0,
    points: 0,
    health: 35,
    badges: [],
    uiState: null
  };
}

app.get('/api/participant-progress', requireSameOrigin, (req, res, next) => {
  const school = normalizeParticipantText(req.query.schoolName);
  const name = normalizeParticipantText(req.query.participantName);
  if (!school || !name || school.length > 100 || name.length > 40) {
    return res.status(400).json({ error: 'Nama sekolah dan nama siswa wajib diisi.' });
  }
  try {
    const key = makeParticipantKey(school, name);
    const row = database.prepare('SELECT progress_json, updated_at FROM participant_progress WHERE participant_id = ?').get(key);
    let progress = null;
    if (row && row.progress_json) {
      try {
        progress = JSON.parse(row.progress_json);
      } catch {
        progress = null;
      }
    }
    progress = migrateParticipantProgress(progress);

    const submissions = database.prepare(`
      SELECT attempt_id, answers_json, assessment_type, mission_number, correct_count, score_percent
      FROM pretest_submissions
      WHERE lower(school_name) = lower(?) AND lower(participant_name) = lower(?)
      ORDER BY submitted_at ASC
    `).all(school, name);

    if (submissions.length > 0) {
      progress = progress && typeof progress === 'object' ? progress : { schema: 4, completed: [], assessments: {} };
      progress.assessments = progress.assessments && typeof progress.assessments === 'object' ? progress.assessments : {};
      progress.completed = Array.isArray(progress.completed) ? progress.completed : [];

      for (const sub of submissions) {
        let parsedAnswers = [];
        try {
          parsedAnswers = JSON.parse(sub.answers_json);
        } catch {
          parsedAnswers = [];
        }
        if (Number.isInteger(sub.mission_number) && sub.mission_number >= 2 && sub.mission_number <= 6) {
          const key = `mission-${sub.mission_number}-${sub.assessment_type}`;
          progress.assessments[key] = {
            completed: true,
            answers: parsedAnswers,
            attemptId: sub.attempt_id,
            ...(sub.assessment_type === 'posttest' ? {
              correct: sub.correct_count ?? 0,
              total: parsedAnswers.length,
              percent: sub.score_percent ?? 0
            } : {})
          };
          if (sub.assessment_type === 'posttest') {
            const missionIndex = sub.mission_number - 1;
            if (!progress.completed.includes(missionIndex)) progress.completed.push(missionIndex);
          }
        } else if (sub.assessment_type === 'pretest' && parsedAnswers.length === QUESTION_COUNT) {
          progress.assessments.pretest = {
            completed: true,
            answers: parsedAnswers,
            attemptId: sub.attempt_id
          };
        } else if (sub.assessment_type === 'posttest' && parsedAnswers.length === POSTTEST_QUESTION_COUNT) {
          progress.assessments['mission-7'] = {
            completed: true,
            correct: sub.correct_count ?? 0,
            total: POSTTEST_QUESTION_COUNT,
            percent: sub.score_percent ?? 0,
            answers: parsedAnswers,
            attemptId: sub.attempt_id
          };
          if (!progress.completed.includes(6)) {
            progress.completed.push(6);
          }
        }
      }
    }

    return res.json({ found: Boolean(progress), progress });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/participant-progress', requireSameOrigin, (req, res, next) => {
  const { schoolName, participantName, progress } = req.body || {};
  const school = normalizeParticipantText(schoolName);
  const name = normalizeParticipantText(participantName);
  if (!school || !name || school.length > 100 || name.length > 40 || !progress || typeof progress !== 'object') {
    return res.status(400).json({ error: 'Data progres peserta tidak valid.' });
  }
  try {
    const key = makeParticipantKey(school, name);
    const source = migrateParticipantProgress(progress) || progress;
    const sanitized = {
      schema: 4,
      completed: Array.isArray(source.completed) ? source.completed.filter(i => Number.isInteger(i) && i >= 0 && i < 10) : [],
      currentMission: Number.isInteger(source.currentMission) ? source.currentMission : 0,
      unlocked: Number.isInteger(source.unlocked) ? source.unlocked : 0,
      assessments: source.assessments && typeof source.assessments === 'object' ? source.assessments : {},
      avatar: source.avatar && typeof source.avatar === 'object' ? source.avatar : null,
      science: Number.isFinite(source.science) ? source.science : 0,
      care: Number.isFinite(source.care) ? source.care : 0,
      points: Number.isFinite(source.points) ? source.points : 0,
      health: Number.isFinite(source.health) ? source.health : 35,
      badges: Array.isArray(source.badges) ? source.badges.slice(0, 20) : [],
      playerTransform: source.playerTransform && typeof source.playerTransform === 'object' ? source.playerTransform : null,
      uiState: source.uiState && typeof source.uiState === 'object' ? source.uiState : null,
      viewSettings: source.viewSettings && typeof source.viewSettings === 'object' ? source.viewSettings : null
    };
    database.prepare(`
      INSERT INTO participant_progress (participant_id, school_name, participant_name, progress_json, updated_at)
      VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(participant_id) DO UPDATE SET
        school_name = excluded.school_name,
        participant_name = excluded.participant_name,
        progress_json = excluded.progress_json,
        updated_at = excluded.updated_at
    `).run(key, school, name, JSON.stringify(sanitized));
    return res.json({ saved: true });
  } catch (error) {
    return next(error);
  }
});

/* ==========================================================================
   GROK AI CHATBOT ENDPOINT (KHUSUS MATERI BAB 6 & EKOLOGI LAUT MADURA)
   ========================================================================== */
const GROK_API_KEY = process.env.GROK_API_KEY || 'grok_27e0bc4c87c6e7c47e01d4cb39b31e07_0a6b5c1595525a4727f6e87355bc271fee8add1a3db396b53e4bb222bb301e74';
const GROK_BASE_URL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-2-latest';

const MARINE_CHAT_SYSTEM_PROMPT = `Kamu adalah EcoBot, chatbot mentor materi untuk siswa SMP yang menjelajahi metaverse Ecoseaverse (Ekosistem Laut Madura, Jawa Timur) dan mempelajari IPA Kelas 7 Bab 6: Ekologi dan Keanekaragaman Hayati Indonesia. Kamu bukan AI Marine, karena AI Marine berperan khusus sebagai pemandu jalan misi.

PANDUAN UTAMA:
1. Ruang Lingkup Materi: Kamu HANYA boleh menjawab materi seputar:
   - Ekosistem laut pesisir Madura (pantai berbatu, pesisir berpasir, padang lamun, hutan mangrove, terumbu karang).
   - Kerang Bambu (Lorjuk / Solen sp.): anatomi, filter feeder (penyaring air), cara menggali pasir dengan kaki berotot, siklus hidup musiman, serta kerentanan terhadap mikroplastik.
   - Materi IPA Kelas 7 Bab 6:
     * Subbab A: Pengaruh Lingkungan terhadap Organisme (komponen abiotik seperti salinitas, suhu, cahaya, oksigen terlarut; serta komponen biotik).
     * Subbab B: Interaksi Antarkomponen Ekosistem (netralisme, predasi, kompetisi, dan simbiosis mutualisme/komensalisme/parasitisme).
     * Subbab C: Aliran Energi (rantai makanan, fitoplankton sebagai produsen utama, zooplankton, tingkat trofik, piramida energi).
     * Subbab D: Rantai Makanan & Jaring-jaring Makanan Bahari.
     * Subbab E: Keanekaragaman Hayati dan Konservasi Laut (ancaman sampah plastik laut, perusakan karang, upaya pelestarian).
2. Batasan Topik (Strict Guardrail): Jika siswa bertanya tentang topik di luar ekologi laut atau IPA Bab 6 (misalnya matematika rumit, game lain, coding, politik, gosip, atau percakapan umum):
   Tolak dengan sopan, ramah, dan bernuansa bahari:
    "Halo teman bahari! Aku EcoBot, chatbot khusus Ekosistem Laut Madura dan IPA Bab 6. Aku hanya bisa membantumu seputar kehidupan laut, rantai makanan, lorjuk, dan konservasi bahari. Yuk tanyakan materi tentang laut kita!"
3. Integritas Kuis: Jangan memberikan contekan jawaban langsung jika ditanya kunci jawaban pre-test, post-test, atau kuis. Arahkan siswa memahami konsepnya.
4. Gaya Bahasa: Ramah, antusias, mudah dipahami siswa SMP, sertakan emoji bahari (🌊, 🐠, 🦪, 🐬, 🦀, 🐢) dan jawaban ringkas namun jelas.`;

function generateMarineFallbackAnswer(userText) {
  const lower = userText.toLowerCase();

  // 1. Deteksi pertanyaan di luar topik
  const offTopicKeywords = ['presiden', 'pemilu', 'politik', 'matematika', 'kalkulus', 'persamaan linear', 'roblox', 'free fire', 'mobile legends', 'valorant', 'minecraft', 'coding', 'python', 'javascript', 'html', 'react', 'pacar', 'jodoh', 'lagu kpop', 'sepak bola'];
  if (offTopicKeywords.some(keyword => lower.includes(keyword))) {
    return 'Halo teman bahari! Aku EcoBot, chatbot khusus Ekosistem Laut Madura dan IPA Bab 6. Aku hanya bisa membantumu seputar kehidupan laut, rantai makanan, lorjuk, dan konservasi bahari. Yuk tanyakan seputar ekologi laut kita!';
  }

  // 2. Deteksi permintaan kunci jawaban kuis
  if ((lower.includes('kunci jawaban') || lower.includes('jawaban soal') || lower.includes('bocoran')) && (lower.includes('pretest') || lower.includes('posttest') || lower.includes('kuis') || lower.includes('nomor'))) {
    return 'Wah, aku tidak bisa memberikan contekan jawaban langsung ya teman bahari! 🐬 Aku di sini untuk membantumu memahami konsepnya. Coba buka kembali materi Misi atau tanyakan konsep materi yang belum kamu pahami!';
  }

  // 3. Pengetahuan terarah tentang Lorjuk / Kerang Bambu
  if (lower.includes('lorjuk') || lower.includes('kerang bambu') || lower.includes('solen')) {
    if (lower.includes('makan') || lower.includes('filter') || lower.includes('saring')) {
      return 'Kerang bambu (lorjuk) mencari makan dengan cara **filter feeder** (menyaring air laut) 🦪. Melalui sifon masuk (*inhalant*), lorjuk menghirup air dan menyaring fitoplankton serta bahan organik mikro dengan insangnya (*ctenidia*), lalu mengeluarkan air sisa melalui sifon keluar (*exhalant*).';
    }
    if (lower.includes('musim') || lower.includes('panen') || lower.includes('pasang surut')) {
      return 'Hasil panen lorjuk khas Madura bersifat musiman dipengaruhi oleh: 🌊 (1) **Siklus pasang surut** — habitat pasir lorjuk hanya dapat dijangkau saat air surut maksimal; (2) **Kondisi lingkungan** — hujan deras dapat mengubah salinitas dan memicu kekeruhan sedimen; (3) **Siklus reproduksi** dan pertumbuhan individu muda.';
    }
    if (lower.includes('gali') || lower.includes('pasir') || lower.includes('kaki')) {
      return 'Lorjuk memiliki **kaki berotot pipih** yang sangat kuat! 🦀 Kaki ini menjulur masuk ke dalam pasir basah, mengembang membentuk jangkar hidrolik, lalu berkontraksi menarik cangkangnya ke bawah hingga terbenam cepat ke dalam liang pasir.';
    }
    return 'Kerang bambu (*Solen* sp.) atau lorjuk adalah moluska bivalvia khas pesisir Madura 🦪. Tubuhnya memanjang terlindung dua katup cangkang, hidup membenamkan diri di pasir pantai berlumpur, dan berperan penting menjaga kebersihan air laut sebagai penyaring alami (*filter feeder*).';
  }

  // 4. Rantai Makanan & Jaring-jaring Makanan Laut (Subbab C & D)
  if (lower.includes('rantai makanan') || lower.includes('jaring') || lower.includes('aliran energi') || lower.includes('trofik') || lower.includes('produsen') || lower.includes('konsumen')) {
    return 'Di ekosistem laut Madura, aliran energi berlangsung melalui rantai makanan 🐠:\n1. **Produsen**: Fitoplankton & lamun (menghasilkan energi via fotosintesis dengan bantuan cahaya matahari ☀️).\n2. **Konsumen I (Herbivora/Filter Feeder)**: Zooplankton, kerang bambu (lorjuk), dan ikan herbivora.\n3. **Konsumen II (Karnivora Kecil)**: Kepiting, ikan badut, cumi-cumi.\n4. **Konsumen Puncak**: Ikan predator besar, lumba-lumba, hiu 🦈.\n5. **Dekomposer**: Bakteri laut mengurai sisa organik kembali menjadi nutrien mineral.';
  }

  // 5. Komponen Biotik & Abiotik (Subbab A)
  if (lower.includes('biotik') || lower.includes('abiotik') || lower.includes('salinitas') || lower.includes('suhu') || lower.includes('lingkungan')) {
    return 'Ekosistem laut tersusun dari dua komponen penting 🌊:\n• **Komponen Abiotik** (tak hidup): Salinitas (kadar garam), suhu air, intensitas cahaya matahari, kejernihan air, dan oksigen terlarut (*Dissolved Oxygen*).\n• **Komponen Biotik** (makhluk hidup): Produsen (fitoplankton, lamun, mangrove), konsumen (lorjuk, ikan, kepiting, penyu), serta dekomposer (bakteri pengurai).';
  }

  // 6. Interaksi & Simbiosis (Subbab B)
  if (lower.includes('simbiosis') || lower.includes('mutualisme') || lower.includes('komensalisme') || lower.includes('parasitisme') || lower.includes('interaksi') || lower.includes('predasi')) {
    return 'Di laut terdapat berbagai interaksi antarorganisme 🤝:\n• **Mutualisme** (saling untung): Ikan badut dan anemon laut — ikan badut terlindung sengatan, sementara anemon bersih dari sisa kotoran.\n• **Komensalisme** (satu untung, satu netral): Ikan remora yang menempel pada hiu untuk mendapat remah makanan.\n• **Predasi**: Kepiting memangsa cacing laut atau ikan predator memangsa ikan kecil.\n• **Kompetisi**: Berbagai jenis kerang bersaing memperebutkan ruang di pasir pesisir.';
  }

  // 7. Sampah Plastik & Konservasi Bahari (Subbab E)
  if (lower.includes('plastik') || lower.includes('mikroplastik') || lower.includes('sampah') || lower.includes('konservasi') || lower.includes('terumbu karang') || lower.includes('rusak')) {
    return 'Sampah plastik di pesisir Madura dapat terfragmentasi menjadi **mikroplastik** (< 5 mm) ⚠️. Kerang lorjuk yang bersifat filter feeder berisiko menyerap partikel mikroplastik ini, mengganggu sistem pencernaannya, dan masuk ke jaring-jaring makanan manusia. Kita bisa membantu konservasi laut dengan tidak membuang sampah ke laut dan melestarikan terumbu karang!';
  }

  // 8. Jawaban default edukatif
  return 'Halo penjelajah laut! 🌊 Terkait pertanyaanmu tentang ekosistem laut Madura: di lingkungan bahari, semua komponen biotik (fitoplankton, kerang lorjuk, ikan, terumbu karang) dan abiotik (suhu, salinitas, cahaya) saling berinteraksi menjaga keseimbangan. Apa bagian materi spesifik yang ingin kamu pelajari lebih dalam?';
}

app.post('/api/chat', requireSameOrigin, async (req, res) => {
  const { message, history } = req.body || {};
  const userText = typeof message === 'string' ? message.trim() : '';

  if (!userText || userText.length > 500) {
    return res.status(400).json({ error: 'Pesan tidak valid (maksimal 500 karakter).' });
  }

  const messagesPayload = [
    { role: 'system', content: MARINE_CHAT_SYSTEM_PROMPT }
  ];

  if (Array.isArray(history)) {
    const validHistory = history.slice(-6).filter(item =>
      item && typeof item.content === 'string' && (item.role === 'user' || item.role === 'assistant')
    );
    messagesPayload.push(...validHistory);
  }

  messagesPayload.push({ role: 'user', content: userText });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const apiResponse = await fetch(`${GROK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: messagesPayload,
        temperature: 0.6,
        max_tokens: 380
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      const botReply = data?.choices?.[0]?.message?.content;
      if (typeof botReply === 'string' && botReply.trim().length > 0) {
        return res.json({ reply: botReply.trim(), provider: 'grok' });
      }
    }
  } catch (apiError) {
    // External API failed, timeout, or invalid key -> gracefully fallback
  }

  // Fallback respons lokal berbasis materi IPA 7 Bab 6
  const fallbackReply = generateMarineFallbackAnswer(userText);
  return res.json({ reply: fallbackReply, provider: 'marine-mentor' });
});

app.get('/api/admin/session', (req, res) => {
  return res.json({ authenticated: hasValidAdminSession(req), configured: isAdminConfigured() });
});

app.get('/api/admin/assessment-submissions', requireAdmin, (req, res, next) => {
  try {
    const rows = database.prepare(`
      SELECT attempt_id AS attemptId, participant_name AS participantName,
             school_name AS schoolName, answers_json AS answersJson, question_set AS questionSet,
              assessment_type AS assessmentType, mission_number AS missionNumber, correct_count AS correct,
             score_percent AS percent, submitted_at AS submittedAt
      FROM pretest_submissions
      ORDER BY submitted_at DESC
      LIMIT 500
    `).all();
    return res.json({
      submissions: rows.map(row => ({
        attemptId: row.attemptId,
        participantName: row.participantName,
        schoolName: row.schoolName,
        answers: JSON.parse(row.answersJson),
        questionSet: row.questionSet,
        assessmentType: row.assessmentType,
        missionNumber: row.missionNumber,
        correct: row.correct,
        total: row.missionNumber ? JSON.parse(row.answersJson).length : (row.assessmentType === 'posttest' ? POSTTEST_QUESTION_COUNT : QUESTION_COUNT),
        percent: row.percent,
        submittedAt: row.submittedAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/participant-progress', requireAdmin, (req, res, next) => {
  try {
    const rows = database.prepare(`
      SELECT participant_id AS participantId, school_name AS schoolName,
             participant_name AS participantName, progress_json AS progressJson,
             updated_at AS updatedAt
      FROM participant_progress
      ORDER BY updated_at DESC
      LIMIT 500
    `).all();
    return res.json({
      progressList: rows.map(row => ({
        participantId: row.participantId,
        schoolName: row.schoolName,
        participantName: row.participantName,
        progress: JSON.parse(row.progressJson),
        updatedAt: row.updatedAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.get(['/admin', '/admin.html'], (req, res) => res.sendFile(path.join(ROOT, 'admin.html')));
app.use('/.private', (req, res) => res.sendStatus(404));
app.use(express.static(ROOT, { index: false, dotfiles: 'deny', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Format JSON permintaan tidak valid.' });
  }
  console.error('[Ecoseaverse] Permintaan server gagal:', error);
  return res.status(500).json({ error: 'Terjadi kesalahan server. Silakan coba lagi.' });
});

const server = app.listen(PORT, () => {
  console.log(`\nEcoseaverse Express server berjalan di http://localhost:${PORT}`);
  console.log(`Dashboard admin: http://localhost:${PORT}/admin`);
  if (!isAdminConfigured()) {
    console.warn('Set ADMIN_PASSWORD (minimal 12 karakter) dan ADMIN_SESSION_SECRET (minimal 32 karakter) untuk mengaktifkan admin.');
  }
  console.log('Tekan Ctrl+C untuk menghentikan server.\n');
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
