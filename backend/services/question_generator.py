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
    is_follow_up: bool,
    domain_type: str = "General",
    role_seniority: str = "General",
    interview_stage: str = "Stage 1 - Warmup"
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
        .replace("{domain_type}", domain_type)
        .replace("{role_seniority}", role_seniority)
        .replace("{interview_stage}", interview_stage)
    )

    try:
        raw_response = await llm.generate_question(final_prompt, max_tokens=300)
        # Clean up any potential markdown or prefixes
        clean_question = raw_response.replace("Question:", "").replace("Interviewer:", "").replace('"', '').strip()
        
        # --- FAILSAFE SANITIZATION LAYER ---
        forbidden_phrases = [
            "follow-up mode", "follow up mode", "follow-up", "difficulty level", 
            "based on the evaluation", "according to the planner", "transitioning to", 
            "evaluator", "json", "topic index", "since follow-up", "roadmap",
            "interview stage", "role seniority", "domain type", "stage 1", "stage 2", "stage 3"
        ]
        
        lower_q = clean_question.lower()
        if any(phrase in lower_q for phrase in forbidden_phrases):
            print(f"CRITICAL WARNING: Orchestration leak detected in generated question: {clean_question}")
            # Fallback to a clean, generic transition to avoid breaking immersion
            if is_follow_up:
                return "Interesting. Could you elaborate a bit more on that specific point?"
            else:
                return f"Got it. Let's shift gears slightly and talk about {current_topic}."

        # Hard Difficulty Filter Sanity Check
        if difficulty.lower() == "easy":
            advanced_terms = ["architecture", "scaling", "distributed systems", "load balancer", "microservices", "kubernetes", "system design"]
            if any(term in lower_q for term in advanced_terms):
                print(f"CRITICAL WARNING: Hard difficulty violation in Easy mode: {clean_question}")
                return f"Could you share a simple example of how you used {current_topic} in a past project?"
                
        return clean_question
        
    except Exception as e:
        print(f"WARNING: Failed to generate question: {e}")
        return "Can you provide a specific example of that from your past experience?"
