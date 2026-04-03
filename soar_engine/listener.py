from fastapi import FastAPI, BackgroundTasks, Request
from rich.console import Console
from rich import print
import uvicorn
from soar_engine.playbook import decide_action

app = FastAPI()
console = Console()

@app.on_event("startup")
async def startup_event():
    console.print("""
    [bold green]
    =========================================
      🛡️  SENTINEL SOAR AUTOMATION LAYER  🛡️
    =========================================
    [/bold green]
    [cyan]STATUS:[/cyan] LISTENING ON PORT 8000
    [cyan]MODE:[/cyan] ASYNC / HIGH-PERFORMANCE
    """)

@app.post("/alert", status_code=202)
async def receive_alert(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    
    # Extract data with safe defaults
    source_ip = data.get("source_ip", "0.0.0.0")
    rule_name = data.get("rule_name", "Unknown Alert")
    full_log = data.get("full_log", str(data))
    
    # Rich log using standard print (or console.log)
    print(f"[bold yellow]⚠️  Alert Received:[/bold yellow] {rule_name} from {source_ip}")
    
    # Offload logic to background
    background_tasks.add_task(decide_action, source_ip, full_log, rule_name)
    
    return {"status": "accepted", "message": "Automation triggered"}

if __name__ == "__main__":
    uvicorn.run("soar_engine.listener:app", host="0.0.0.0", port=8000, reload=True)
