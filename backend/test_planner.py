import asyncio
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from llm.groq import GroqProvider
from services.interview_planner import generate_interview_plan

async def run_test(name, resume, jd, interview_type, difficulty):
    print(f"Running Test: {name}")
    llm = GroqProvider()
    
    plan = await generate_interview_plan(
        llm=llm,
        resume=resume,
        job_description=jd,
        interview_type=interview_type,
        difficulty=difficulty
    )
    
    print("Result:")
    print(json.dumps(plan, indent=2))
    print("="*50)
    return plan

async def main():
    results = {}
    
    # TEST CASE 1 — FRONTEND INTERNSHIP
    resume_1 = "Skills: React, JavaScript, HTML, CSS. Projects: E-commerce Dashboard with React, Chat Application."
    jd_1 = "Frontend Internship. Looking for someone with React and JavaScript experience."
    results["Test 1 (Frontend Internship)"] = await run_test(
        "Frontend Internship", resume_1, jd_1, "Technical", "Medium"
    )
    
    # TEST CASE 2 — HR INTERVIEW
    resume_2 = "Sales associate. Good communication skills."
    jd_2 = "Any role."
    results["Test 2 (HR Interview)"] = await run_test(
        "HR Interview", resume_2, jd_2, "HR", "Easy"
    )
    
    # TEST CASE 3 — HARD BACKEND
    resume_3 = "Skills: FastAPI, PostgreSQL, Python, Redis. Experience building async systems and high throughput APIs."
    jd_3 = "Backend Engineer. Must have experience with scalable architectures, performance optimization, and database tuning."
    results["Test 3 (Hard Backend)"] = await run_test(
        "Hard Backend", resume_3, jd_3, "Technical", "Hard"
    )

    with open("planner_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    asyncio.run(main())
