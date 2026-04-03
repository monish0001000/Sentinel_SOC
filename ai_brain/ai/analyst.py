import httpx
from rich import print

KEYWORD_WEIGHTS = {
    "mimikatz": 90,
    "meterpreter": 85,
    "shadow copy": 80,
    "powershell -enc": 75,
    "nmap": 60,
    "ssh": 30,
    "ping": 10,
    "login": 5
}

def calculate_threat_score(log_entry: str) -> int:
    score = 0
    lower_log = log_entry.lower()
    for keyword, weight in KEYWORD_WEIGHTS.items():
        if keyword in lower_log:
            score += weight
    return min(score, 100)

async def analyze_log_with_ollama(log_entry: str) -> str:
    """
    Sends the log entry to a local Ollama instance for analysis, 
    pre-filtered by keyword scoring.
    """
    # 1. Local Scoring
    local_score = calculate_threat_score(log_entry)
    print(f"[bold cyan]🔍 Local Keyword Score:[/bold cyan] {local_score}/100")
    
    # 2. External AI
    url = "http://localhost:11434/api/generate"
    
    prompt = f"""
    Act as a Level 3 Security Analyst. Analyze this log:
    {log_entry}
    
    Context:
    - Keyword Score: {local_score}
    
    Is this a false positive or a real attack? Summarize the attack in one sentence.
    """
    
    payload = {
        "model": "llama3",
        "prompt": prompt,
        "stream": False
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=30.0)
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "No response from AI.")
            else:
                print(f"[bold red]❌ Ollama Error:[/bold red] {response.status_code}")
                return "AI Analysis Failed: API Error"
    except Exception as e:
        # Fallback to local score if AI fails
        verdict = "High Risk" if local_score > 70 else "Low Risk"
        print(f"[bold red]❌ Connection Error:[/bold red] {str(e)} - Falling back to local score.")
        return f"Offline Analysis: {verdict} (Score: {local_score})"
