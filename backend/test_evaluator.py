import asyncio
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from llm.groq import GroqProvider
from services.answer_evaluator import evaluate_answer

async def run_test(name, question, answer, topic, interview_type, difficulty):
    print(f"Running Test: {name}")
    llm = GroqProvider()
    
    evaluation = await evaluate_answer(
        llm=llm,
        latest_question=question,
        candidate_answer=answer,
        current_topic=topic,
        interview_type=interview_type,
        difficulty=difficulty
    )
    
    print("Result:")
    print(json.dumps(evaluation, indent=2))
    print("="*50)
    return evaluation

async def main():
    results = {}
    
    # TEST CASE 1
    results["Test 1 (Strong Technical)"] = await run_test(
        "Strong Technical",
        "What are JavaScript closures?",
        "Closures occur when an inner function retains access to variables from its lexical scope even after the outer function has finished execution. They're useful for data privacy, memoization, and maintaining state.",
        "JavaScript Closures",
        "Technical",
        "Medium"
    )
    
    # TEST CASE 2
    results["Test 2 (Surface-Level)"] = await run_test(
        "Surface-Level",
        "What are JavaScript closures?",
        "Closures are functions inside functions.",
        "JavaScript Closures",
        "Technical",
        "Medium"
    )
    
    # TEST CASE 3
    results["Test 3 (Buzzword Answer)"] = await run_test(
        "Buzzword Answer",
        "How did you optimize your backend APIs?",
        "I used caching, optimization, scalability, and microservices.",
        "Backend Optimization",
        "Technical",
        "Hard"
    )

    # TEST CASE 4
    results["Test 4 (Good Implementation)"] = await run_test(
        "Good Implementation",
        "How did you handle async processing in FastAPI?",
        "I used async endpoints with asyncio and background tasks to avoid blocking requests. I also used Redis queues for long-running tasks.",
        "FastAPI Async",
        "Technical",
        "Medium"
    )

    # TEST CASE 5
    results["Test 5 (HR Behavioral)"] = await run_test(
        "HR Behavioral",
        "Tell me about a conflict in your team.",
        "We had disagreements during a project. I discussed the issue with teammates and we solved it together.",
        "Conflict Resolution",
        "HR",
        "Medium"
    )

if __name__ == "__main__":
    asyncio.run(main())
