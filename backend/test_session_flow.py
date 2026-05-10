import requests
import time
import os

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

def safe_json(response):
    try:
        return response.json()
    except Exception:
        return {"_raw": response.text}

def test_interview_flow():
    # 1. Start Interview
    print("Starting interview...")
    start_payload = {
        "resume_text": "Software Engineer with 5 years of experience in React and Node.js. Built a high-performance e-commerce platform.",
        "job_description": "We are looking for a Senior Frontend Engineer proficient in React and system architecture.",
        "interview_type": "Technical",
        "difficulty": "Medium",
        "total_duration": 1, # 1 minute for quick test
        "user_name": "Afroz"
    }
    
    response = requests.post(f"{BASE_URL}/api/start", json=start_payload, timeout=30)
    if response.status_code != 200:
        print(f"FAILED to start: {response.text}")
        return
    
    data = safe_json(response)
    session_id = data["session_id"]
    print(f"Session ID: {session_id}")
    print(f"State: {data['state']}")
    print(f"First Question: {data['question']}\n")
    
    # 2. Answer a few questions
    for i in range(5):
        time.sleep(1) # simulate some time passing
        print(f"Answering question {i+1}...")
        answer_payload = {
            "session_id": session_id,
            "answer": f"This is my answer to question {i+1}. I have extensive experience in this area."
        }
        
        response = requests.post(f"{BASE_URL}/api/answer", json=answer_payload, timeout=30)
        if response.status_code != 200:
            print(f"FAILED to answer: {response.text}")
            break
            
        data = safe_json(response)
        print(f"State: {data['state']}")
        if data.get("question"):
            print(f"Next Question: {data['question']}")
        
        if data["is_final"]:
            print("\nInterview Ended Cleanly.")
            break
        print("-" * 20)

if __name__ == "__main__":
    test_interview_flow()
