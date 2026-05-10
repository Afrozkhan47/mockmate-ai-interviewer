
import requests
import time
import json
import os

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api")

def safe_json(response):
    try:
        return response.json()
    except Exception:
        raise RuntimeError(f"Invalid JSON response ({response.status_code}): {response.text[:300]}")

def test_full_flow():
    user_name = "Verification Bot"
    # 1. Start Interview
    print("Starting interview...")
    start_resp = requests.post(f"{BASE_URL}/start", json={
        "resume_text": "Experienced Python Engineer. Technical lead at Google for 5 years.",
        "job_description": "Senior Backend Role. Knowledge of FastAPI and SQL required.",
        "interview_type": "Technical",
        "total_duration": 10,
        "difficulty": "Hard",
        "user_name": user_name
    })
    if start_resp.status_code != 200:
        raise RuntimeError(f"Start failed ({start_resp.status_code}): {start_resp.text[:300]}")
    start_data = safe_json(start_resp)
    session_id = start_data["session_id"]
    print(f"Session started: {session_id}")

    # 2. Answer a few questions
    for i in range(3):
        print(f"Answering question {i+1}...")
        ans_resp = requests.post(f"{BASE_URL}/answer", json={
            "session_id": session_id,
            "answer": f"I have significant experience with {['SQL optimization', 'FastAPI concurrency', 'distributed systems'][i]} in high-load production environments."
        }, timeout=30)
        if ans_resp.status_code != 200:
            raise RuntimeError(f"Answer failed ({ans_resp.status_code}): {ans_resp.text[:300]}")
        time.sleep(1)

    # 3. End early to trigger summary
    print("Ending interview early...")
    requests.post(f"{BASE_URL}/interviews/{session_id}/end")

    # 4. Wait for summary generation (might take a few seconds)
    print("Waiting for summary...")
    time.sleep(5)

    # 5. Get Summary and Verify Content
    print("Fetching summary...")
    sum_resp = requests.get(f"{BASE_URL}/interviews/{session_id}/summary", timeout=30)
    if sum_resp.status_code != 200:
        raise RuntimeError(f"Summary failed ({sum_resp.status_code}): {sum_resp.text[:300]}")
    summary = safe_json(sum_resp)

    print("\n--- SUMMARY AUDIT ---")
    print(f"Overview Length: {len(summary['overview'].split('.'))} sentences")
    print(f"Strengths: {len(summary['strengths'])}")
    print(f"Improvements: {len(summary['improvements'])}")
    print(f"Recommendations: {len(summary['recommendations'])}")
    
    # Assertions
    assert len(summary['overview'].split('.')) >= 3, "Overview too short"
    assert len(summary['strengths']) >= 4, "Not enough strengths"
    assert len(summary['improvements']) >= 3, "Not enough improvements"
    assert len(summary['recommendations']) >= 4, "Not enough recommendations"
    assert isinstance(summary['recommendations'], list), "Recommendations should be a list"

    print("\n✓ Content Quality Verified!")

    # 6. Check History for Duplicates
    print("\nChecking history...")
    history_resp = requests.get(f"{BASE_URL}/interviews/history", timeout=30)
    if history_resp.status_code != 200:
        raise RuntimeError(f"History failed ({history_resp.status_code}): {history_resp.text[:300]}")
    history = safe_json(history_resp)
    
    session_counts = {}
    for item in history:
        session_counts[item['session_id']] = session_counts.get(item['session_id'], 0) + 1
    
    duplicates = [sid for sid, count in session_counts.items() if count > 1]
    assert not duplicates, f"Found duplicate session IDs in history: {duplicates}"
    
    # Check for orphan IN_PROGRESS orphans (though they might not show up if we just started this)
    print(f"Total history entries: {len(history)}")
    print("✓ No duplicates found in history response.")

if __name__ == "__main__":
    try:
        test_full_flow()
        print("\nALL TESTS PASSED!")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        if 'summary' in locals():
            print("Full Summary Data for Debug:")
            print(json.dumps(summary, indent=2))
