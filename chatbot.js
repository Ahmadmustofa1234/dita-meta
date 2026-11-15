// chatbot.js - EcoBot, chatbot materi yang terpisah dari AI Marine pemandu misi.
// Berlaku selama perjalanan misi materi; otomatis hilang saat menjawab kuis / pre-test / post-test

const chatState = {
    isOpen: false,
    history: [],
    isSending: false
};

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    // Bullet lists
    html = html.replace(/^[•\-\*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
}

export function updateChatbotVisibility() {
    const aiChatPanel = document.getElementById('ai-chat-panel');
    const startOverlay = document.getElementById('start-overlay');
    const missionPopup = document.getElementById('mission-popup');

    // Chatbot materi disembunyikan saat peserta belum masuk atau saat asesmen aktif.
    const isOverlayOnScreen = startOverlay && startOverlay.style.display !== 'none' && !startOverlay.classList.contains('hidden');
    let isAnsweringQuiz = false;
    if (missionPopup && !missionPopup.classList.contains('hidden')) {
        const hasQuizElements = missionPopup.querySelector('.quiz-session, .task-choices, .task-choice:not(.avatar-choice)');
        const isPosttest = window.missions && Number.isInteger(window.state?.currentMission) &&
            window.missions[window.state.currentMission]?.type === 'posttest';
        const isChapterPretestActive = missionPopup.classList.contains('chapter-pretest-active');
        const isAssessmentActive = missionPopup.classList.contains('assessment-active');
        if (hasQuizElements || isPosttest || isChapterPretestActive || isAssessmentActive) {
            isAnsweringQuiz = true;
        }
    }

    // Aturan pengguna:
    // Chatbot cuman berlaku di perjalanan misi materi, ketika jawab soal chatbotnya hilang!
    const shouldHide = isOverlayOnScreen || isAnsweringQuiz;

    if (shouldHide) {
        if (aiChatPanel) {
            aiChatPanel.classList.add('hidden');
            aiChatPanel.classList.remove('material-companion');
            chatState.isOpen = false;
        }
    }
}

export function initChatbot() {
    const chatPanel = document.getElementById('ai-chat-panel');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const btnOpenChat = document.getElementById('btn-open-chatbot');

    if (!chatPanel || !chatForm || !chatInput || !chatMessages) return;

    const toggleChat = (force, materialCompanion = false) => {
        const nextState = typeof force === 'boolean' ? force : chatPanel.classList.contains('hidden');
        if (nextState) {
            chatPanel.classList.remove('hidden');
            chatPanel.classList.toggle('material-companion', materialCompanion);
            chatState.isOpen = true;
            setTimeout(() => chatInput.focus(), 100);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            chatPanel.classList.add('hidden');
            chatPanel.classList.remove('material-companion');
            chatState.isOpen = false;
        }
    };

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-open-material-chat]');
        if (trigger) {
            e.preventDefault();
            if (document.fullscreenElement) {
                document.exitFullscreen()
                    .then(() => toggleChat(true, true))
                    .catch(error => {
                        console.error('Tidak dapat keluar dari layar penuh untuk membuka chatbot:', error);
                    });
                return;
            }
            toggleChat(true, true);
        }
    });

    if (btnOpenChat) {
        btnOpenChat.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChat(true);
        });
    }

    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', () => {
            toggleChat(false);
        });
    }

    // Delegasi chip pertanyaan cepat
    chatMessages.addEventListener('click', (e) => {
        const chip = e.target.closest('.chat-chip');
        if (chip && chip.dataset.query) {
            chatInput.value = chip.dataset.query;
            sendMessage(chip.dataset.query);
        }
    });

    const appendMessage = (sender, text) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg chat-msg-${sender}`;
        if (sender === 'bot') {
            msgDiv.innerHTML = `
                <div class="chat-msg-avatar">🤖</div>
                <div class="chat-bubble">${formatMarkdown(text)}</div>
            `;
        } else {
            msgDiv.innerHTML = `
                <div class="chat-bubble"><p>${escapeHtml(text)}</p></div>
            `;
        }
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgDiv;
    };

    const showTypingIndicator = () => {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-msg chat-msg-typing';
        typingDiv.id = 'chat-typing-indicator';
        typingDiv.innerHTML = `
            <div class="chat-msg-avatar">🤖</div>
            <div class="chat-bubble">
                <div class="chat-typing-indicator" aria-label="EcoBot sedang mengetik">
                    <span class="chat-typing-dot"></span>
                    <span class="chat-typing-dot"></span>
                    <span class="chat-typing-dot"></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingDiv;
    };

    const generateOfflineMarineAnswer = (rawQuery) => {
        const q = String(rawQuery || '').toLowerCase();
        if (q.includes('abiotik') || q.includes('biotik') || q.includes('lingkungan') || q.includes('subbab a')) {
            return '🌊 **[Mode Offline — Subbab A]**\nEkosistem tersusun atas komponen **biotik** (makhluk hidup: ikan, terumbu karang, lamun, bakteri) dan **abiotik** (faktor tak hidup: cahaya matahari, suhu, salinitas/kadar garam, pH, oksigen terlarut, dan pasang surut).';
        }
        if (q.includes('rantai') || q.includes('jaring') || q.includes('simbiosis') || q.includes('interaksi') || q.includes('subbab b')) {
            return '🐠 **[Mode Offline — Subbab B]**\nInteraksi ekosistem meliputi **rantai makanan** (produsen fitoplankton/lamun → konsumen → pengurai) dan **simbiosis** (contoh: ikan badut & anemon laut saling menguntungkan = **mutualisme**).';
        }
        if (q.includes('wallace') || q.includes('weber') || q.includes('keanekaragaman') || q.includes('endemik') || q.includes('subbab c')) {
            return '🗺️ **[Mode Offline — Subbab C]**\nIndonesia memiliki keanekaragaman hayati tinggi yang dibagi garis **Wallace** dan **Weber** menjadi zona Asiatis (barat), Peralihan (tengah/Sulawesi), dan Australis (timur).';
        }
        if (q.includes('plastik') || q.includes('sampah') || q.includes('pencemaran') || q.includes('manusia') || q.includes('subbab d')) {
            return '♻️ **[Mode Offline — Subbab D]**\nAktivitas manusia seperti membuang **sampah plastik** dapat terurai menjadi **mikroplastik (< 5 mm)** yang tertelan biota penyaring seperti **lorjuk**, serta merusak terumbu karang.';
        }
        if (q.includes('konservasi') || q.includes('in-situ') || q.includes('ex-situ') || q.includes('subbab e')) {
            return '🛡️ **[Mode Offline — Subbab E]**\nKonservasi dilakukan secara **in-situ** (di habitat asli, misalnya Taman Nasional Laut) dan **ex-situ** (di luar habitat asli, misalnya penangkaran atau akuarium konservasi).';
        }
        if (q.includes('lorjuk') || q.includes('kerang')) {
            return '🦪 **[Mode Offline — Lorjuk]**\n**Lorjuk (*Solen* sp.)** adalah kerang bambu khas pesisir Madura yang hidup membenamkan diri di pasir pasang surut dan makan dengan cara **filter feeder** (menyaring fitoplankton dari air laut).';
        }
        return '📡 **[Mode Offline]**\nSaat ini kamu sedang offline, namun kamu tetap bisa membaca **modul PDF Subbab A–E**, mengerjakan **Pre-test & Post-test**, serta mengeksplorasi **Virtual Lab Lorjuk**. Coba tanyakan kata kunci seperti *biotik*, *rantai makanan*, *Wallace*, *plastik*, *konservasi*, atau *lorjuk*!';
    };

    const sendMessage = async (text) => {
        const query = (text || chatInput.value || '').trim();
        if (!query || chatState.isSending) return;

        chatInput.value = '';
        chatState.isSending = true;
        const submitBtn = document.getElementById('chat-submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        appendMessage('user', query);
        const typingEl = showTypingIndicator();

        if (!navigator.onLine) {
            typingEl.remove();
            const offlineReply = generateOfflineMarineAnswer(query);
            appendMessage('bot', offlineReply);
            chatState.history.push({ role: 'user', content: query });
            chatState.history.push({ role: 'assistant', content: offlineReply });
            chatState.isSending = false;
            if (submitBtn) submitBtn.disabled = false;
            chatInput.focus();
            return;
        }

        const isNativeCapacitor = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
        if (isNativeCapacitor || (typeof navigator !== 'undefined' && !navigator.onLine)) {
            typingEl.remove();
            const offlineReply = generateOfflineMarineAnswer(query);
            appendMessage('bot', offlineReply);
            chatState.history.push({ role: 'user', content: query });
            chatState.history.push({ role: 'assistant', content: offlineReply });
            chatState.isSending = false;
            if (submitBtn) submitBtn.disabled = false;
            chatInput.focus();
            return;
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 7000) : null;
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: query,
                    history: chatState.history.slice(-6)
                }),
                ...(controller ? { signal: controller.signal } : {})
            });

            typingEl.remove();

            if (!response.ok) {
                const offlineReply = generateOfflineMarineAnswer(query);
                appendMessage('bot', offlineReply);
            } else {
                const data = await response.json();
                const reply = data.reply || 'Halo teman bahari! Ada materi laut yang ingin kamu tanyakan?';
                appendMessage('bot', reply);
                chatState.history.push({ role: 'user', content: query });
                chatState.history.push({ role: 'assistant', content: reply });
            }
        } catch (err) {
            if (typingEl) typingEl.remove();
            const offlineReply = generateOfflineMarineAnswer(query);
            appendMessage('bot', offlineReply);
        } finally {
            if (timer) clearTimeout(timer);
            chatState.isSending = false;
            if (submitBtn) submitBtn.disabled = false;
            chatInput.focus();
        }
    };

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // Observer untuk mendeteksi kapan kuis atau soal muncul / hilang secara realtime
    const observer = new MutationObserver(() => {
        updateChatbotVisibility();
    });

    const missionPopup = document.getElementById('mission-popup');
    if (missionPopup) {
        observer.observe(missionPopup, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    }

    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) {
        observer.observe(startOverlay, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    window.updateChatbotVisibility = updateChatbotVisibility;
    window.toggleChat = toggleChat;
    updateChatbotVisibility();
}
