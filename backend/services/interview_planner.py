import json
import os
import re
from typing import Dict, Any

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.json_utils import safe_json_parse

async def generate_interview_plan(
    llm: Any,
    resume: str,
    job_description: str,
    interview_type: str,
    difficulty: str
) -> Dict[str, Any]:
    """
    Generates a structured pre-interview roadmap using the LLM.
    """
    prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/interview_planner.txt")
    try:
        with open(prompt_path, "r") as f:
            template = f.read()
    except Exception as e:
        print(f"Error loading planner prompt: {e}")
        return _fallback_plan()

    # Truncate text just in case (already sanitized in /start, but safe to do here)
    safe_resume = resume[:3000] if resume else "Not provided"
    safe_jd = job_description[:1500] if job_description else "Not provided"

    final_prompt = (
        template.replace("{resume}", safe_resume)
        .replace("{jd}", safe_jd)
        .replace("{interview_type}", interview_type)
        .replace("{difficulty}", difficulty)
    )

    try:
        raw_response = await llm.generate_question(final_prompt, max_tokens=1000)
        
        plan_data = safe_json_parse(raw_response, _fallback_plan())
        return plan_data
        
    except Exception as e:
        print(f"WARNING: Failed to generate interview plan: {e}")
        return _fallback_plan()

def _fallback_plan() -> Dict[str, Any]:
    return {
        "skills_to_test": ["Core Fundamentals"],
        "topic_order": ["Introduction", "Experience", "Technical Concepts", "Closing"],
        "resume_projects_to_probe": ["Past Experience"],
        "behavioral_focus": ["Communication", "Problem-solving"],
        "difficulty_strategy": {
            "start": "easy",
            "middle": "medium",
            "end": "medium"
        }
    }
