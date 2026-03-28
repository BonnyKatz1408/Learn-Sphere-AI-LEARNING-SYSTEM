# 🌐 LearnSphere

An AI-powered adaptive learning platform that generates personalized study paths, concept explanations, code examples, visual diagrams, and audio lectures — all from a single topic input.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📊 **Adaptive Dashboard** | Auto-generates a skill dependency map, phased roadmap, and live mastery metrics |
| ♾️ **Infinite Quiz Engine** | Dynamic MCQs with weakness detection and on-demand question generation |
| 📄 **Concept Engine** | Difficulty-tuned explanations with LaTeX math rendering via MathJax |
| 💻 **Practice Lab** | AI-generated, runnable Python code with dependency detection |
| 🖼️ **Visual Learning** | Stable Diffusion-generated technical diagrams for any topic |
| 🎧 **Audio Classroom** | Text-to-speech lectures in 4 accents (US, UK, Australian, Indian) |
| 💬 **AI Tutor Chatbot** | Floating context-aware chatbot for follow-up questions |

---

## 🛠️ Tech Stack

- **Backend:** Python, Flask, Google Gemini 2.5 Flash
- **Image Gen:** Stability AI (Stable Diffusion XL)
- **Audio:** Microsoft Edge TTS (`edge-tts`)
- **Frontend:** Vanilla JS, HTML/CSS, Highlight.js, MathJax

---

## 🚀 Setup

```bash
pip install flask flask-cors google-generativeai edge-tts youtube-search markdown requests

# Add your API keys in app.py
API_KEY = "YOUR_GEMINI_API_KEY"
STABILITY_API_KEY = "YOUR_STABILITY_API_KEY"

python app.py
# Open http://localhost:5000
```

---

## 🎯 Usage

1. Select a **persona** (Student / Professor / Professional)
2. Enter a **topic** (e.g. `Backpropagation`, `LSTM`, `Transformers`)
3. Choose a **tutor voice** accent
4. Click **Initialize Engine** — everything generates automatically

---

## 📁 Project Structure

```
├── app.py              # Flask backend & API routes
├── templates/
│   └── index.html      # Main UI
└── static/
    ├── script.js       # Frontend logic
    └── style.css       # Dark theme styling
```
## MySQL database description
1. Databse name :learnsphere
2. Table name: users
3. **Table Description :**
```
+----------+-------------+------+-----+---------+----------------+
| Field    | Type        | Null | Key | Default | Extra          |
+----------+-------------+------+-----+---------+----------------+
| id       | int         | NO   | PRI | NULL    | auto_increment |
| name     | varchar(50) | YES  |     | NULL    |                |
| username | varchar(50) | YES  | UNI | NULL    |                |
| password | varchar(50) | YES  |     | NULL    |                |
+----------+-------------+------+-----+---------+----------------+
```
