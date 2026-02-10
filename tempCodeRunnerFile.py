import os
import re
import markdown
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
import google.generativeai as genai
from gtts import gTTS
import tempfile
import mysql.connector
from dotenv import load_dotenv
import json
from youtube_search import YoutubeSearch
import edge_tts 
import sys
import asyncio
from flask_cors import CORS
import io
import requests # Required for Image Gen
import urllib.parse # Required for Image Fallback

# --- WINDOWS ASYNC FIX ---
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = Flask(__name__)
CORS(app) 

load_dotenv()
app.secret_key = "supersecretkey123"

gemini_api_key = os.getenv("GEMINI_API")
db_host = os.getenv("DBHOST")
db_pass = os.getenv("DBPASS")
db_user = os.getenv("DBUSER")

mydb = mysql.connector.connect(
    host=db_host,
    user=db_user,
    password=db_pass,
    database="learnsphere"
)

# CONFIGURATION
API_KEY = gemini_api_key
genai.configure(api_key=API_KEY)

# *** STABILITY AI CONFIGURATION ***
STABILITY_API_KEY = "sk-JqIgfZqMwUcrsQA1JSdt4waplE41pXFzJVqpuJf9yq3GFLRy"
STABILITY_API_HOST = "https://api.stability.ai"

# MODEL CONFIGURATION
generation_config = {
    "temperature": 0.7,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
}

# --- MODEL INITIALIZATION ---
try:
    print("Attempting to load gemini-2.5-flash...")
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash", 
        generation_config=generation_config,
    )
    print("SUCCESS: Using gemini-2.5-flash")
except Exception as e:
    print(f"WARNING: gemini-2.5-flash failed. Falling back to 1.5-flash. Error: {e}")
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash", 
        generation_config=generation_config,
    )

# --- PROMPTS ---
SYSTEM_PROMPTS = {
    "beginner": """You are an encouraging CS tutor. Explain complex ML concepts simply using analogies. 
    Focus on the 'Why' and 'How'. IMPORTANT: Enclose all math in $...$ for inline and $$...$$ for blocks.
    Format with Markdown. Use bolding for key terms.""",
    "intermediate": """You are an academic professor. Balance theory and practice. 
    IMPORTANT: Enclose all math in $...$ for inline and $$...$$ for blocks.
    Provide standard mathematical formulations. Explain algorithms clearly.""",
    "advanced": """You are a Senior Data Scientist. Focus on production, scalability, and optimization. 
    Use precise technical terminology. Assume the user knows the basics. 
    IMPORTANT: Enclose all math in $...$ for inline and $$...$$ for blocks.
    Discuss pros/cons and edge cases."""
}

CODE_PROMPTS = {
    "beginner": """Act as a code generator. Task: Write a Python script for the user's request.
    Style: Beginner-friendly, use numpy/matplotlib, heavy inline comments.
    IMPORTANT: Output ONLY valid Python code inside ```python``` blocks.""",
    "advanced": """Act as a code generator. Task: Write a production-ready Python script for the user's request.
    Style: Use PyTorch/TensorFlow, object-oriented design, error handling.
    IMPORTANT: Output ONLY valid Python code inside ```python``` blocks."""
}

# --- ARCHITECTURE PROMPT ---
ARCHITECTURE_PROMPT = """
You are a Senior Learning Architect. Generate a complete Adaptive Learning Architecture for the topic: '{topic}' for a {difficulty} level {persona}.

Output MUST be a valid JSON object with this exact structure:
{{
  "analytics": {{
    "time_saved": "string (e.g. '12 hrs')",
    "mastery_progress": 10,
    "confidence_score": 85,
    "topic_coverage": 100
  }},
  "knowledge_graph": [
    {{
      "id": 1, 
      "skill": "Concept Name", 
      "difficulty": 20, 
      "description": "Short 1 sentence summary",
      "resources": [
        {{"type": "Video", "title": "Watch: {topic} Visual Guide", "query": "{topic} tutorial"}},
        {{"type": "Article", "title": "Read: GeeksforGeeks Guide", "url": "https://www.geeksforgeeks.org/search?q={topic}"}},
        {{"type": "Article", "title": "Read: Medium Deep Dive", "url": "https://medium.com/search?q={topic}"}}
      ]
    }}
  ],
  "roadmap": [
    {{"phase": "Phase 1: Foundation", "task": "Actionable task", "hours": 2, "objective": "Learning Goal"}}
  ],
  "quiz": [
    {{"question": "Question Text", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "Reasoning", "topic_tag": "Subtopic"}}
  ]
}}

IMPORTANT RULES:
1. "time_saved" must be realistic (NOT 0).
2. For "resources":
   - For "Video", do NOT provide a URL. Provide a "query" string (e.g., "Backpropagation tutorial").
   - For "Article", always use SEARCH URLs (e.g. "https://www.geeksforgeeks.org/search?q=...") to avoid 404 errors.
3. Group roadmap items into logical Phases (Phase 1, Phase 2...).
4. Return ONLY JSON.
"""

QUIZ_PROMPT = """
Generate 4 NEW multiple-choice questions about '{topic}' for a {difficulty} learner.
Output JSON Format:
{{
  "questions": [
    {{
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Brief explanation.",
      "topic_tag": "Specific concept"
    }}
  ]
}}
Return ONLY JSON.
"""

# --- HELPER FUNCTIONS ---

def detect_dependencies(code_string):
    imports = re.findall(r'^(?:import|from)\s+(\w+)', code_string, re.MULTILINE)
    std_lib = ['os', 'sys', 'math', 're', 'time', 'random']
    return list(set([imp for imp in imports if imp not in std_lib]))

def generate_question_data():
    """Generates a single ML question using Gemini and returns as a dict."""
    prompt = """
    You are an AI that generates Machine Learning multiple-choice questions.
    Return ONLY a JSON object in this format:
    {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Correct option text exactly as it appears in options"
    }
    """
    try:
        response = model.generate_content(prompt)
        # Clean potential markdown backticks from response
        clean_json = re.search(r'\{.*\}', response.text, re.DOTALL).group()
        return json.loads(clean_json)
    except Exception as e:
        print(f"Error: {e}")
        return None

# --- ROBUST ASYNC RUNNER (FIXES AUDIO BREAKAGE) ---
def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    if loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, loop).result()
    else:
        return loop.run_until_complete(coro)

async def get_edge_audio(text, voice_code):
    communicate = edge_tts.Communicate(text, voice_code)
    mp3_fp = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_fp.write(chunk["data"])
    mp3_fp.seek(0)
    return mp3_fp

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('home.html')

@app.route('/chatbot')
def chatbot():
    return render_template('chat.html')

@app.route('/loginpage')
def loginpage():
    return render_template('login.html')

@app.route('/login', methods=["POST","GET"])
def login():
    if request.method=="POST":
        username = request.form.get('user')
        password = request.form.get('pass')
        mycursor = mydb.cursor()
        sql = "select password,id from users where username= %s"
        val = (username,) 
        mycursor.execute(sql, val)
        result = mycursor.fetchone()
        if result:
            or_password = result[0]
            uid = result[1]
            if or_password == password:
                session["user"] = username
                session["id"] = uid
    return redirect(url_for("index"))

@app.route('/signuppage')
def signuppage():
    return render_template("signup.html")        

@app.route('/signup', methods=["POST"])
def signup():
    if request.method=="POST":
        username = request.form.get('username')
        password = request.form.get('password')
        name = request.form.get('name')
        mycursor = mydb.cursor()
        sql = "insert into users(name,username,password) values(%s ,%s,%s)"
        values = (name, username, password,)
        mycursor.execute(sql, values)
        mydb.commit()
    return redirect(url_for("loginpage"))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for("index"))

# --- QUIZ LOGIC ---

@app.route('/quiz')
def quiz():
    if "user" not in session:
        return redirect(url_for("loginpage"))
    return render_template('quiz.html')

@app.route('/api/get-question')
def get_question_api():
    data = generate_question_data()
    if data:
        return jsonify(data)
    return jsonify({"error": "Failed to generate question"}), 500

# --- GENERATION ROUTES ---

@app.route('/generate/architecture', methods=['POST'])
def generate_architecture():
    data = request.json
    persona_map = {"beginner": "Student", "intermediate": "Professor", "advanced": "Professional"}
    diff = data.get('difficulty', 'beginner')
    
    prompt = ARCHITECTURE_PROMPT.format(
        topic=data.get('topic'), 
        difficulty=diff,
        persona=persona_map.get(diff, "Student")
    )
    
    try:
        response = model.generate_content(prompt)
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            clean_text = match.group()
            return jsonify(json.loads(clean_text))
        else:
            return jsonify({"status": "error", "message": "Failed to parse JSON architecture."})
    except Exception as e:
        print(f"ARCH ERROR: {e}")
        return jsonify({"status": "error", "message": str(e)})

@app.route('/generate/quiz', methods=['POST'])
def generate_quiz():
    data = request.json
    prompt = QUIZ_PROMPT.format(topic=data.get('topic'), difficulty=data.get('difficulty'))
    try:
        response = model.generate_content(prompt)
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            clean_text = match.group()
            return jsonify(json.loads(clean_text))
        else:
            return jsonify({"status": "error", "message": "Failed to parse Quiz JSON."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/generate/text', methods=['POST'])
def generate_text():
    data = request.json
    prompt = f"{SYSTEM_PROMPTS[data.get('difficulty', 'beginner')]}\n\nExplain: '{data.get('topic')}'"
    try:
        response = model.generate_content(prompt)
        html_content = markdown.markdown(response.text)
        return jsonify({"status": "success", "content": html_content, "raw_text": response.text})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/generate/code', methods=['POST'])
def generate_code():
    data = request.json
    code_style = CODE_PROMPTS['advanced'] if data.get('difficulty') == 'advanced' else CODE_PROMPTS['beginner']
    prompt = f"{code_style}\n\nTask: Write implementation for: '{data.get('topic')}'"
    try:
        response = model.generate_content(prompt)
        code_match = re.search(r'```(?:python)?\s*(.*?)```', response.text, re.DOTALL)
        clean_code = code_match.group(1).strip() if code_match else response.text 
        return jsonify({"status": "success", "code": clean_code, "dependencies": detect_dependencies(clean_code)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/generate/audio', methods=['POST'])
def generate_audio():
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({"status": "error", "message": "No text provided for audio."}), 400

    voice_map = {
        'us': 'en-US-GuyNeural',      
        'uk': 'en-GB-SoniaNeural',    
        'aus': 'en-AU-WilliamNeural', 
        'ind': 'en-IN-NeerjaNeural'   
    }
    voice_code = voice_map.get(data.get('voice'), 'en-US-GuyNeural')
    
    try:
        # Generate audio using the isolated async runner
        mp3_fp = run_async(get_edge_audio(text[:2000], voice_code))
        return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=True, download_name="lesson.mp3")
    except Exception as e:
        print(f"Audio Generation Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ROBUST VISUAL GENERATION (Stability + Fallback) ---
@app.route('/generate/visual', methods=['POST'])
def generate_visual():
    data = request.json
    topic = data.get('topic')
    
    # 1. Try Stability AI (Primary)
    if STABILITY_API_KEY:
        try:
            response = requests.post(
                f"{STABILITY_API_HOST}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "image/png",
                    "Authorization": f"Bearer {STABILITY_API_KEY}"
                },
                json={
                    "text_prompts": [{"text": f"futuristic technical schematic of {topic}, blueprint style, vector art, white on dark blue background, highly detailed, 4k", "weight": 1}],
                    "cfg_scale": 7,
                    "height": 1024,
                    "width": 1024,
                    "samples": 1,
                    "steps": 30,
                },
                timeout=15 
            )

            if response.status_code == 200:
                return send_file(
                    io.BytesIO(response.content),
                    mimetype='image/png',
                    as_attachment=False,
                    download_name='diagram.png'
                )
            else:
                print(f"Stability API Failed: {response.text}")
        except Exception as e:
            print(f"Stability Error: {e}")

    # 2. Fallback to Pollinations.ai (Backup)
    print("Switching to Pollinations Fallback...")
    try:
        safe_topic = urllib.parse.quote(f"technical schematic of {topic} blueprint dark mode")
        image_url = f"https://image.pollinations.ai/prompt/{safe_topic}?width=1024&height=1024&nologo=true&seed=42"
        
        # Proxy the image through backend to avoid CORS/Hotlink issues
        resp = requests.get(image_url, timeout=10)
        if resp.status_code == 200:
            return send_file(
                io.BytesIO(resp.content),
                mimetype='image/jpeg',
                as_attachment=False,
                download_name='diagram.jpg'
            )
    except Exception as e:
        print(f"Pollinations Error: {e}")

    return jsonify({"status": "error", "message": "All image generation methods failed."}), 500

@app.route('/get_video', methods=['POST'])
def get_video():
    data = request.json
    query = data.get('query')
    try:
        results = YoutubeSearch(query, max_results=1).to_dict()
        if results:
            video_id = results[0]['id']
            return jsonify({"status": "success", "video_id": video_id})
        return jsonify({"status": "error", "message": "No video found"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    topic = data.get('topic', 'General Learning')
    user_msg = data.get('message', '')
    
    prompt = f"""You are a helpful AI tutor assisting a student who is currently learning about: '{topic}'.
    The student asks: "{user_msg}"
    Provide a concise, encouraging, and helpful answer (max 3 sentences)."""
    
    try:
        response = model.generate_content(prompt)
        return jsonify({"response": response.text})
    except Exception as e:
        return jsonify({"response": "I'm having trouble connecting right now. Try again later!"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)