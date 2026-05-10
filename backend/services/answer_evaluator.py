import json
import os
import re
from typing import Dict, Any

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.json_utils import safe_json_parse

async def evaluate_answer(
    llm: Any,
    latest_question: str,
    candidate_answer: str,
    current_topic: str,
    interview_type: str,
    difficulty: str
) -> Dict[str, Any]:
    """
    Evaluates the candidate's latest answer to determine depth, missing concepts,
    and whether a follow-up is required.
    """
    prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/answer_evaluator.txt")
    try:
        with open(prompt_path, "r") as f:
            template = f.read()
    except Exception as e:
        print(f"Error loading evaluator prompt: {e}")
        return _fallback_evaluation()

    final_prompt = (
        template.replace("{latest_question}", latest_question)
        .replace("{candidate_answer}", candidate_answer)
        .replace("{current_topic}", current_topic or "General")
        .replace("{interview_type}", interview_type)
        .replace("{difficulty}", difficulty)
    )

    try:
        raw_response = await llm.generate_question(final_prompt, max_tokens=1000)
        
        evaluation_data = safe_json_parse(raw_response, _fallback_evaluation())
        
        # Guard against LLM missing keys
        evaluation_data.setdefault("reasoning", "No reasoning provided by LLM.")
        evaluation_data.setdefault("missing_concepts", [])
        evaluation_data.setdefault("candidate_strengths", [])
        evaluation_data.setdefault("candidate_weaknesses", [])
        
        return evaluation_data
        
    except Exception as e:
        print(f"WARNING: Failed to evaluate answer: {e}")
        return _fallback_evaluation()

def _fallback_evaluation() -> Dict[str, Any]:
    return {
        "answer_quality": "average",
        "follow_up_required": False,
        "current_topic": "Unknown",
        "missing_concepts": [],
        "candidate_strengths": ["Attempted to answer the question"],
        "candidate_weaknesses": ["Evaluation failed, proceeding normally"],
        "difficulty_adjustment": "maintain",
        "reasoning": "Fallback evaluation triggered due to LLM error."
    }
