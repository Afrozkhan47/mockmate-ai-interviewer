import requests
import json
import os

def test_start_interview_context():
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    url = f"{base_url}/api/start"
    payload = {
        "resume_text": "CANDIDATE: John Doe. Built REST APIs using FastAPI and PostgreSQL.",
        "job_description": "Software Developer Intern role requiring Python and API development.",
        "interview_type": "Technical",
        "difficulty": "Medium",
        "total_duration": 10,
        "user_name": "Context Test User"
    }

    print(f"Sending request to {url}...")
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Start Response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_start_interview_context()
