
import requests
import time
import sys
import os
from requests.exceptions import ReadTimeout

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api")

def safe_json(response):
    try:
        return response.json()
    except Exception:
        return {"_raw": response.text}

def run_test():
    print("1. Starting Session...")
    res = requests.post(f"{BASE_URL}/start", json={
        "resume_text": "Experienced Python Developer with FastAPI skills.",
        "job_description": "Senior Python Engineer",
        "interview_type": "Technical",
        "difficulty": "Medium",
        "total_duration": 15,
        "user_name": "TestUser"
    }, timeout=30)
    if res.status_code != 200:
        print(f"Failed to start: {res.text}")
        return
    
    data = safe_json(res)
    sid = data['session_id']
    print(f"Session ID: {sid}")

    print("2. Answering 1 Question (to create history)...")
    requests.post(
        f"{BASE_URL}/answer",
        json={"session_id": sid, "answer": "I have used FastAPI for building async APIs and SQLAlchemy for ORM."},
        timeout=30
    )

    print("3. Force Ending Session Early...")
    try:
        end_res = requests.post(f"{BASE_URL}/interviews/{sid}/end", timeout=30)
        if end_res.status_code != 200:
            print(f"Failed to end: {end_res.text}")
            return
        print("Session ended.")
    except ReadTimeout:
        # End can still succeed server-side while summary generation is in progress.
        print("End request timed out; continuing to poll summary endpoint.")

    print("4. Polling summary availability...")
    summary_ready = False
    for _ in range(12):
        try:
            sum_res = requests.get(f"{BASE_URL}/interviews/{sid}/summary", timeout=10)
            if sum_res.status_code == 200:
                summary_ready = True
                break
        except Exception:
            pass
        time.sleep(2)
    
    history_res = requests.get(f"{BASE_URL}/interviews/history", timeout=30)
    history = safe_json(history_res)
    
    my_session = next((h for h in history if h['session_id'] == sid), None)
    
    if not my_session:
        print("CRITICAL: Session not found in history!")
        return

    print(f"Status in DB: {my_session['status']}")
    print(f"Summary ID: {my_session['summary_id']}")

    if my_session['summary_id'] or summary_ready:
        print("✅ SUCCESS: Summary generated for early ended session.")
        # Fetch the summary content
        sum_res = requests.get(f"{BASE_URL}/interviews/{sid}/summary", timeout=30)
        if sum_res.status_code == 200:
            s_data = safe_json(sum_res)
            if s_data.get('structured_feedback'):
                print("✅ STRICT JSON Structured Feedback detected.")
                print("Verdict:", s_data['structured_feedback'].get('overall_assessment', {}).get('verdict'))
            else:
                print("⚠️ Structured Feedback missing (legacy format).")
        else:
            print(f"Failed to fetch summary: {sum_res.text}")
    else:
        print("❌ FAILURE: No summary ID found.")

if __name__ == "__main__":
    run_test()
