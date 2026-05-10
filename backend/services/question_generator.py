import os
import json
from typing import Any, Optional

async def generate_next_question(
    llm: Any,
    current_topic: str,
    latest_question: str,
    candidate_answer: str,
    evaluation_results: Optional[dict],
    difficulty: str,
    is_follow_up: bool
) -> str:
    """
    Generates the next interview question using the Question Decision Engine logic.
    """
    prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/question_generator.txt")
    try:
        with open(prompt_path, "r") as f:
            template = f.read()
    except Exception as e:
        print(f"Error loading question generator prompt: {e}")
        return "Could you elaborate more on that?"

    eval_str = json.dumps(evaluation_results, indent=2) if evaluation_results else "None"

    safe_question = latest_question if latest_question else "None (This is the start of the topic)"
    safe_answer = candidate_answer if candidate_answer else "None (Please initiate the topic)"
    
    final_prompt = (
        template.replace("{current_topic}", current_topic)
        .replace("{latest_question}", safe_question)
        .replace("{candidate_answer}", safe_answer)
        .replace("{evaluation_results}", eval_str)
        .replace("{difficulty}", difficulty)
        .replace("{is_follow_up}", "TRUE" if is_follow_up else "FALSE")
    )

    try:
        raw_response = await llm.generate_question(final_prompt, max_tokens=300)
        # Clean up any potential markdown or prefixes
        clean_question = raw_response.replace("Question:", "").replace("Interviewer:", "").replace('"', '').strip()
        return clean_question
        
    except Exception as e:
        print(f"WARNING: Failed to generate question: {e}")
        return "Can you provide a specific example of that from your past experience?"
