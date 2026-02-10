// State Management
let currentTopic = "";
let currentDifficulty = "beginner";
let cachedText = ""; // Store text to generate audio later

document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const views = {
        'text': document.getElementById('text-view'),
        'code': document.getElementById('code-view'),
        'visual': document.getElementById('visual-view'),
        'audio': document.getElementById('audio-view')
    };

    const navBtns = document.querySelectorAll('.nav-btn');
    const startBtn = document.getElementById('start-btn');
    const loader = document.getElementById('loader');

    // Navigation Switcher
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update Active Button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update View
            const mode = btn.dataset.mode;
            Object.values(views).forEach(el => el.classList.add('hidden'));
            views[mode].classList.remove('hidden');
            views[mode].classList.add('active');

            // Trigger generation if switching to specific views and no content exists
            if (mode === 'code' && document.getElementById('code-output').innerText === "# Code will appear here...") {
                fetchCode();
            }
            if (mode === 'visual' && document.querySelector('.placeholder-box')) {
                fetchVisual();
            }
        });
    });

    // Main Generation Trigger
    startBtn.addEventListener('click', () => {
        currentTopic = document.getElementById('topic').value;
        currentDifficulty = document.getElementById('difficulty').value;
        
        // Reset Views
        resetViews();
        
        // Start with Text
        fetchText();
    });

    // --- API CALLS ---

    async function fetchText() {
        showLoader(true);
        try {
            const res = await fetch('/generate/text', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ topic: currentTopic, difficulty: currentDifficulty })
            });
            const data = await res.json();
            
            // --- ERROR HANDLING ---
            if (data.status === "error") {
                alert("AI Error: " + data.message);
                document.getElementById('text-output').innerHTML = `<p style="color:red">Error: ${data.message}</p>`;
                return; // Stop here
            }
            // --------------------------

            document.getElementById('text-output').innerHTML = data.content;
            cachedText = data.raw_text; // Save for TTS
            
            // Auto generate audio in background
            fetchAudio(data.raw_text);
            
        } catch (e) {
            alert("Network Error: " + e);
        } finally {
            showLoader(false);
        }
    }

    async function fetchCode() {
        showLoader(true);
        try {
            const res = await fetch('/generate/code', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ topic: currentTopic, difficulty: currentDifficulty })
            });
            const data = await res.json();

            // Error Check
            if (data.status === "error") {
                alert("Code Gen Error: " + data.message);
                return;
            }
            
            const codeBlock = document.getElementById('code-output');
            codeBlock.textContent = data.code;
            hljs.highlightElement(codeBlock); // Apply syntax highlighting
            
            // Update Dependencies Badge
            const badge = document.getElementById('deps-badge');
            badge.textContent = data.dependencies.length > 0 ? 
                `Requires: ${data.dependencies.join(', ')}` : "Standard Libs Only";
                
        } catch (e) {
            console.error(e);
        } finally {
            showLoader(false);
        }
    }

    async function fetchVisual() {
        showLoader(true);
        try {
            const res = await fetch('/generate/visual', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ topic: currentTopic })
            });
            const data = await res.json();
            
            const container = document.getElementById('visual-output');
            container.innerHTML = `<img src="${data.placeholder_url}" alt="${data.image_prompt}">`;
            
        } finally {
            showLoader(false);
        }
    }

    async function fetchAudio(text) {
        // This runs quietly in background usually, or explicitly requested
        try {
            const res = await fetch('/generate/audio', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ text: text })
            });
            
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audioPlayer = document.getElementById('audio-player');
                audioPlayer.src = url;
                document.getElementById('audio-status').textContent = "Audio ready to play.";
            }
        } catch (e) {
            console.error("Audio generation failed", e);
        }
    }

    // --- UTILS ---
    function showLoader(state) {
        state ? loader.classList.remove('hidden') : loader.classList.add('hidden');
    }

    function resetViews() {
        // Reset logic here to clear previous results
        document.getElementById('text-output').innerHTML = '<p class="placeholder-text">Generating...</p>';
        document.getElementById('code-output').textContent = "# Code will appear here...";
        document.getElementById('audio-status').textContent = "Waiting for text...";
    }
});

// Global functions for inline buttons
function copyCode() {
    const code = document.getElementById('code-output').textContent;
    navigator.clipboard.writeText(code);
    alert("Code copied to clipboard!");
}