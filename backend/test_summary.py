import requests
import time
import os

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

def safe_json(response):
    try:
        return response.json()
    except Exception:
        return {"_raw": response.text}

def test_summary_flow():
    # 1. Start Interview
    print("Starting interview...")
    start_payload = {
        "resume_text": "Experienced Frontend Engineer with 4 years of React experience. Expert in CSS and UX design.",
        "job_description": "Junior Frontend Developer. Must know React and basic CSS.",
        "interview_type": "Technical",
        "difficulty": "Easy",
        "total_duration": 1, # 1 minute
        "user_name": "Test User"
    }
    
    response = requests.post(f"{BASE_URL}/api/start", json=start_payload, timeout=30)
    if response.status_code != 200:
        print(f"Failed to start interview: {response.text}")
        return
    data = safe_json(response)
    session_id = data["session_id"]
    print(f"Session started: {session_id}")

    # 2. Answer questions until END state
    # We'll just answer twice to hit the thresholds if possible, but the state machine might need more.
    # Actually, WARM_UP ends after 2 questions or 15% time.
    # 1 minute is 60 seconds. 15% is 9 seconds.
    
    max_attempts = 20
    attempts = 0
    while attempts < max_attempts:
        print(f"Answering question {attempts + 1}...")
        answer_payload = {
            "session_id": session_id,
            "answer": "I have been working with React for 4 years and I love building beautiful UIs. I am also familiar with Node.js and SQL."
        }
        resp = requests.post(f"{BASE_URL}/api/answer", json=answer_payload, timeout=30)
        if resp.status_code != 200:
            print(f"Failed to answer question: {resp.text}")
            return
        data = safe_json(resp)
        print(f"Question: {data.get('question', 'N/A')}")
        print(f"Current State: {data['state']}")
        
        if data.get("is_final"):
             print("Interview reached END state.")
             break
        
        attempts += 1
        time.sleep(3) # Pass more time to hit the minutes threshold
    
    if attempts >= max_attempts:
        print("Timeout reached without interview ending.")
        return
        
    # 3. Fetch Summary
    print("\nFetching Summary...")
    sum_resp = requests.get(f"{BASE_URL}/api/summary?session_id={session_id}", timeout=30)
    if sum_resp.status_code == 200:
        summary = safe_json(sum_resp)
        print("Summary Generated Successfully:")
        print(f"Overview: {summary['overview']}")
        print(f"Strengths: {summary['strengths']}")
        print(f"Improvements: {summary['improvements']}")
        print(f"Recommendations: {summary['recommendations']}")
    else:
        print(f"Failed to get summary: {sum_resp.text}")

if __name__ == "__main__":
    test_summary_flow()
