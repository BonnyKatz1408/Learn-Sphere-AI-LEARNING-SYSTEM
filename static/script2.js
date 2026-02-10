let currentTopic = "";
let currentDifficulty = "beginner";
let cachedArchitecture = null;
let cachedText = "";
let masteryScore = 0; 
let quizQuestions = [];
let currentQuizIndex = 0;
let quizLoading = false;

document.addEventListener('DOMContentLoaded', () => {
    const views = {
        'dashboard': document.getElementById('dashboard-view'),
        'text': document.getElementById('text-view'),
        'code': document.getElementById('code-view'),
        'visual': document.getElementById('visual-view'),
        'audio': document.getElementById('audio-view')
    };

    const startBtn = document.getElementById('start-btn');
    const loader = document.getElementById('loader');
    const globalAudioPlayer = document.getElementById('global-audio-player');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const downloadBtn = document.getElementById('download-btn'); 
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.values(views).forEach(el => el.classList.add('hidden'));
            views[btn.dataset.mode].classList.remove('hidden');
        });
    });

    startBtn.addEventListener('click', async () => {
        currentTopic = document.getElementById('topic').value;
        currentDifficulty = document.getElementById('difficulty').value;
        const codePrompt = document.getElementById('code-prompt');
        if(codePrompt) codePrompt.value = currentTopic;

        showLoader(true);
        resetEngine();

        try {
            await Promise.all([fetchArchitecture(), fetchText()]);
            fetchCode();
            fetchVisual();
        } catch (e) {
            console.error("Engine Error:", e);
            alert("Error initializing engine: " + e.message);
        } finally {
            showLoader(false);
        }
    });

    async function fetchArchitecture() {
        const res = await fetch('/generate/architecture', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ topic: currentTopic, difficulty: currentDifficulty })
        });
        const data = await res.json();
        if (data.status === "error") throw new Error(data.message);
        
        cachedArchitecture = data;
        masteryScore = data.analytics?.mastery_progress || 10;
        quizQuestions = data.quiz || [];
        currentQuizIndex = 0;
        renderDashboard(data);
    }

    function renderDashboard(data) {
        document.getElementById('m-time').textContent = (data.analytics?.time_saved && data.analytics.time_saved !== "0 hrs") ? data.analytics.time_saved : "12 hrs";
        document.getElementById('m-conf').textContent = (data.analytics?.confidence_score || 85) + "%";
        document.getElementById('m-cover').textContent = (data.analytics?.topic_coverage || 95) + "%";
        updateMasteryDisplay();

        document.getElementById('knowledge-graph-container').innerHTML = data.knowledge_graph.map((node, i) => `
            <div class="graph-node" id="node-${i}" onclick="openNodeModal(${i})">
                <strong>${node.skill}</strong><br><small>Rigor: ${node.difficulty}%</small>
            </div>
        `).join('<div style="text-align:center; color:gray; margin-bottom:8px;">↓</div>');

        const roadCont = document.getElementById('roadmap-container');
        const grouped = {};
        data.roadmap.forEach(step => {
            const p = step.phase || "Phase 1";
            if (!grouped[p]) grouped[p] = [];
            grouped[p].push(step);
        });

        let html = "";
        for (const [phase, tasks] of Object.entries(grouped)) {
            html += `<div class="roadmap-phase-group"><h4 class="roadmap-header">${phase}</h4><div class="roadmap-tasks">`;
            tasks.forEach(t => {
                html += `<div class="roadmap-task"><span class="task-dot"></span><p><strong>${t.objective}:</strong> ${t.task} <small style="opacity:0.6">(${t.hours}h)</small></p></div>`;
            });
            html += `</div></div>`;
        }
        roadCont.innerHTML = html;

        renderCurrentQuestion();
    }

    // --- QUIZ LOGIC ---
    function renderCurrentQuestion() {
        const wrapper = document.getElementById('quiz-wrapper');
        const nextBtnBox = document.getElementById('quiz-actions');
        nextBtnBox.classList.add('hidden');
        
        if (currentQuizIndex >= quizQuestions.length) {
            wrapper.innerHTML = '<p style="color:#aaa; text-align:center;">Generating new questions...</p>';
            fetchMoreQuestions();
            return;
        }

        const q = quizQuestions[currentQuizIndex];
        document.getElementById('quiz-counter').textContent = `Q: ${currentQuizIndex + 1}`;
        
        wrapper.innerHTML = `
            <div class="quiz-question-box">
                <p style="font-weight:bold; margin-bottom:1rem;">${q.question}</p>
                <div class="quiz-options">
                    ${q.options.map((opt, i) => `<div class="quiz-opt" onclick="checkAnswer(this, ${i})">${opt}</div>`).join('')}
                </div>
                <div id="q-explanation" class="quiz-explanation hidden"></div>
            </div>
        `;
    }

    window.checkAnswer = (el, idx) => {
        if (el.parentElement.classList.contains('answered')) return;
        el.parentElement.classList.add('answered');

        const q = quizQuestions[currentQuizIndex];
        const explainBox = document.getElementById('q-explanation');
        
        if (idx === q.answer) {
            el.classList.add('correct');
            explainBox.innerHTML = `<strong>Correct!</strong> ${q.explanation}`;
            explainBox.style.borderLeftColor = "#10b981";
        } else {
            el.classList.add('incorrect');
            el.parentElement.children[q.answer].classList.add('correct');
            explainBox.innerHTML = `<strong>Incorrect.</strong> ${q.explanation}`;
            explainBox.style.borderLeftColor = "#ef4444";
            
            const list = document.getElementById('weakness-list');
            if (!list.innerHTML.includes(q.topic_tag)) {
                list.innerHTML += `<li style="color:#fca5a5; margin-bottom:5px;">⚠️ Weakness: ${q.topic_tag || "General"}</li>`;
                document.getElementById('weakness-report').classList.remove('hidden');
            }
        }
        explainBox.classList.remove('hidden');
        document.getElementById('quiz-actions').classList.remove('hidden');
    };

    document.getElementById('next-question-btn').addEventListener('click', () => {
        currentQuizIndex++;
        renderCurrentQuestion();
    });

    async function fetchMoreQuestions() {
        if (quizLoading) return;
        quizLoading = true;
        try {
            const res = await fetch('/generate/quiz', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ topic: currentTopic, difficulty: currentDifficulty })
            });
            const data = await res.json();
            if (data.questions) {
                quizQuestions = quizQuestions.concat(data.questions);
                renderCurrentQuestion();
            }
        } catch(e) { console.error(e); }
        quizLoading = false;
    }

    // --- MODAL LOGIC (UPDATED FOR VIDEO) ---
    window.openNodeModal = async (index) => {
        const node = cachedArchitecture.knowledge_graph[index];
        const modal = document.getElementById('resource-modal');
        const nodeEl = document.getElementById(`node-${index}`);
        
        document.getElementById('modal-title').textContent = node.skill;
        document.getElementById('modal-desc').textContent = node.description;
        
        const resContainer = document.getElementById('modal-resources');
        resContainer.innerHTML = '<p style="color:#aaa;">Loading resources...</p>';

        let resHtml = '';
        
        if (node.resources) {
            for (const res of node.resources) {
                if (res.type === "Video") {
                    try {
                        const vidRes = await fetch('/get_video', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ query: res.query })
                        });
                        const vidData = await vidRes.json();
                        if (vidData.status === 'success') {
                            resHtml += `
                                <div style="margin-bottom:15px;">
                                    <p style="color:#fff; margin-bottom:5px;">${res.title}</p>
                                    <iframe width="100%" height="250" src="https://www.youtube.com/embed/${vidData.video_id}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>
                                </div>`;
                        } else {
                            resHtml += `<p style="color:red;">Video unavailable.</p>`;
                        }
                    } catch (e) { console.error(e); }
                } else {
                    resHtml += `
                        <a href="${res.url}" target="_blank" class="resource-item">
                            <span class="resource-tag">${res.type}</span>
                            <span>${res.title}</span>
                            <span style="margin-left:auto;">↗</span>
                        </a>`;
                }
            }
        }
        
        resContainer.innerHTML = resHtml || '<p>No resources found.</p>';

        const btn = document.getElementById('mark-complete-btn');
        if (nodeEl.classList.contains('completed')) {
            btn.textContent = "❌ Mark Incomplete";
            btn.style.background = "#4b5563";
        } else {
            btn.textContent = "✅ Mark as Complete";
            btn.style.background = "linear-gradient(135deg, var(--primary), #6d28d9)";
        }
        
        btn.onclick = () => {
            nodeEl.classList.toggle('completed');
            const total = cachedArchitecture.knowledge_graph.length;
            const done = document.querySelectorAll('.graph-node.completed').length;
            masteryScore = Math.round((done / total) * 100);
            updateMasteryDisplay();
            closeModal();
        };
        modal.classList.remove('hidden');
    };

    window.closeModal = () => {
        document.getElementById('resource-modal').classList.add('hidden');
        document.getElementById('modal-resources').innerHTML = ""; 
    };
    
    function updateMasteryDisplay() { document.getElementById('m-progress').textContent = masteryScore + "%"; }

    // --- OTHER FETCHERS ---
    async function fetchText() {
        const res = await fetch('/generate/text', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ topic: currentTopic, difficulty: currentDifficulty })
        });
        const data = await res.json();
        document.getElementById('text-output').innerHTML = data.content;
        cachedText = data.raw_text;
        if(window.MathJax) MathJax.typeset();
    }

    async function fetchCode() {
        const prompt = document.getElementById('code-prompt').value || currentTopic;
        const res = await fetch('/generate/code', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ topic: prompt, difficulty: currentDifficulty })
        });
        const data = await res.json();
        document.getElementById('code-output').textContent = data.code;
        hljs.highlightElement(document.getElementById('code-output'));
    }

    async function fetchVisual() {
        const visualBox = document.getElementById('visual-output');
        visualBox.innerHTML = '<div style="color:gray;">Generating high-res visual...</div>';
        
        try {
            const res = await fetch('/generate/visual', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ topic: currentTopic })
            });
            
            if(!res.ok) throw new Error("Image Gen Failed");
            
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            visualBox.innerHTML = `<img src="${url}" style="width:100%; border-radius:12px; border:1px solid #2e2e3a;">`;
        } catch(e) {
            visualBox.innerHTML = `<div style="color:red;">Error generating visual.</div>`;
        }
    }

    // --- AUDIO LOGIC ---
    playBtn.addEventListener('click', () => {
        if (globalAudioPlayer.src && globalAudioPlayer.src !== window.location.href) {
            globalAudioPlayer.play().catch(e => console.error("Play error:", e));
        } else if (cachedText) {
            fetchAudio(cachedText);
        } else {
            alert("Wait for text to load.");
        }
    });
    
    pauseBtn.addEventListener('click', () => globalAudioPlayer.pause());
    
    globalAudioPlayer.addEventListener('play', () => {
        playBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        document.getElementById('audio-status-text').textContent = "Playing...";
    });
    
    globalAudioPlayer.addEventListener('pause', () => {
        playBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        document.getElementById('audio-status-text').textContent = "Paused";
    });

    globalAudioPlayer.addEventListener('ended', () => {
        playBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        document.getElementById('audio-status-text').textContent = "Finished";
    });

    async function fetchAudio(text) {
        document.getElementById('audio-status-text').textContent = "Generating...";
        try {
            const res = await fetch('/generate/audio', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ text: text, voice: document.getElementById('voice-select').value })
            });
            
            if (!res.ok) throw new Error("Audio gen failed");

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            
            // 1. Update Mini Player (Existing)
            globalAudioPlayer.src = url;
            if(downloadBtn) { downloadBtn.href = url; downloadBtn.classList.remove('hidden'); }
            
            // 2. Update Audio Guide Tab (New)
            const fullAudioPlayer = document.getElementById('full-audio-player');
            const downloadBtnLarge = document.getElementById('download-btn-large');
            const guideStatus = document.getElementById('audio-guide-status');

            if(fullAudioPlayer) {
                fullAudioPlayer.src = url;
                fullAudioPlayer.load();
            }
            if(downloadBtnLarge) {
                downloadBtnLarge.href = url;
                downloadBtnLarge.classList.remove('hidden');
            }
            if(guideStatus) {
                guideStatus.textContent = "Audio generated successfully. Click play.";
            }

            globalAudioPlayer.play().catch(e => console.error("Auto-play blocked:", e));
        } catch(e) {
            console.error(e);
            document.getElementById('audio-status-text').textContent = "Error";
        }
    }

    const genCodeBtn = document.getElementById('gen-code-btn');
    if(genCodeBtn) genCodeBtn.addEventListener('click', fetchCode);
    
    function showLoader(s) { loader.classList[s?'remove':'add']('hidden'); }
    function resetEngine() {
        document.getElementById('text-output').innerHTML = "";
        document.getElementById('weakness-report').classList.add('hidden');
        document.getElementById('weakness-list').innerHTML = "";
        document.getElementById('chat-topic-label').textContent = currentTopic || "the topic"; // UPDATE CHAT TOPIC
        // Reset chat
        document.getElementById('chat-messages').innerHTML = `<div class="bot-msg">Hi! I'm listening. Ask me anything about <span id="chat-topic-label">${currentTopic}</span>.</div>`;
    }
});

// --- NEW: CHAT FUNCTIONS ---
function toggleChat() {
    const chat = document.getElementById('chatbot-container');
    const icon = document.getElementById('toggle-icon');
    chat.classList.toggle('collapsed');
    icon.textContent = chat.classList.contains('collapsed') ? '▲' : '▼';
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const msgsDiv = document.getElementById('chat-messages');
    msgsDiv.innerHTML += `<div class="user-msg" style="text-align:right; margin:5px 0; color:#aaa;">${msg}</div>`;
    input.value = "";
    msgsDiv.scrollTop = msgsDiv.scrollHeight;

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: msg, topic: currentTopic })
        });
        const data = await res.json();
        msgsDiv.innerHTML += `<div class="bot-msg" style="margin:5px 0; color:white;">${data.response}</div>`;
    } catch(e) {
        msgsDiv.innerHTML += `<div class="bot-msg" style="color:red;">Error connecting.</div>`;
    }
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
}

function copyCode() { navigator.clipboard.writeText(document.getElementById('code-output').textContent); alert("Copied!"); }
function downloadNotebook() {
    const code = document.getElementById('code-output').textContent;
    const blob = new Blob([code], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "lesson.ipynb"; a.click();
}