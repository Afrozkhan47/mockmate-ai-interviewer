
import json
from typing import Dict, List, Any
from llm.groq import GroqProvider

def validate_feedback(feedback: Dict[str, Any], is_early_ended: bool) -> List[str]:
    errors = []
    
    # 1. Score Validation
    scores = []
    category_scores = feedback.get("category_scores", {})
    for cat, data in category_scores.items():
        score = data.get("score")
        if not isinstance(score, int) or score < 1 or score > 5:
            errors.append(f"Score for category '{cat}' must be integer 1-5. Got: {score}")
        else:
            scores.append(score)
            
    # 2. Verdict Consistency
    if scores:
        avg_score = sum(scores) / len(scores)
        verdict = feedback.get("overall_assessment", {}).get("verdict")
        
        expected_verdict = []
        if avg_score >= 4.2:
            expected_verdict = ["strong_hire"]
        elif 3.6 <= avg_score <= 4.1:
            expected_verdict = ["hire"]
        elif 3.0 <= avg_score <= 3.5:
            expected_verdict = ["lean_hire"]
        elif 2.5 <= avg_score <= 2.9:
            expected_verdict = ["lean_no_hire"]
        else:
            expected_verdict = ["no_hire"]
            
        if verdict not in expected_verdict:
            errors.append(f"Verdict '{verdict}' is inconsistent with average score {avg_score:.2f}. Expected: {expected_verdict[0]}")

    # 3. Early-Ended Rule
    if is_early_ended:
        confidence = feedback.get("overall_assessment", {}).get("confidence_level")
        # Schema says int 1-5?, prompt says nothing specific about strict enum for confidence_level int, 
        # BUT meta evaluation_confidence is enum high/medium/low.
        # User requirement: "evaluation_confidence must NOT be 'high'".
        # Let's check META evaluation_confidence as per schema in prompt:
        # "meta": { "evaluation_confidence": "high | medium | low" }
        meta_conf = feedback.get("meta", {}).get("evaluation_confidence", "").lower()
        if meta_conf == "high":
            errors.append("Early-ended interview cannot have 'high' evaluation_confidence.")

    # 4. Minimum Content Rules
    overview = feedback.get("overall_assessment", {}).get("summary", "")
    if len(overview.split('.')) < 3:
        errors.append("RULE_VIOLATION: Overview summary must be at least 3 sentences.")

    strengths = feedback.get("strengths", [])
    if not strengths or len(strengths) < 4:
        errors.append(f"RULE_VIOLATION: Must have AT LEAST 4-5 strengths (currently have {len(strengths)}).")
        
    weaknesses = feedback.get("weaknesses", [])
    if not weaknesses or len(weaknesses) < 3:
        errors.append(f"RULE_VIOLATION: Must have AT LEAST 3-4 weaknesses/improvement areas (currently have {len(weaknesses)}).")
    else:
        for w in weaknesses:
            if not w.get("impact"):
                errors.append(f"RULE_VIOLATION: Weakness point '{w.get('point', 'N/A')}' missing 'impact' field.")

    return errors

async def repair_feedback_with_llm(feedback: Dict[str, Any], errors: List[str], llm: GroqProvider) -> Dict[str, Any]:
    print(f"DEBUG: Attempting to repair feedback. Errors: {errors}")
    
    verdict = feedback.get("overall_assessment", {}).get("verdict", "hire").lower()
    bias_instruction = ""
    if "no_hire" in verdict:
        bias_instruction = "IMPORTANT: Performance was poor. PRIORITIZE weaknesses (add 5 specific points if possible)."
    else:
        bias_instruction = "IMPORTANT: Performance was good. PRIORITIZE strengths (add 5 specific points if possible)."

    prompt = f"""
    You generated structured feedback but it failed validation with these errors:
    
    ERRORS:
    {json.dumps(errors, indent=2)}
    
    ORIGINAL JSON:
    {json.dumps(feedback, indent=2)}
    
    TASK:
    Fix the invalid parts to satisfy these STRICT rules:
    1. Overview summary: 3-4 full sentences.
    2. Strengths: Exactly 4-5 items. If short on evidence, infer from Resume/Job Description.
    3. Weaknesses/Areas to Improve: Exactly 3-5 items. Be very specific.
    4. Improvement Plan: Ensure at least 5 total actions are listed.
    5. Verdict must match avg score: (>=4.2 Strong Hire, 3.6-4.1 Hire, 3.0-3.5 Lean Hire, 2.5-2.9 Lean No Hire, <2.5 No Hire).
    
    {bias_instruction}
    
    Return ONLY the corrected FIXED JSON. No markdown fences.
    """
    
    try:
        raw = await llm.generate_question(prompt)
        clean = raw.strip()
        if clean.startswith("```json"):
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif clean.startswith("```"):
            clean = clean.split("```")[1].split("```")[0].strip()
        return json.loads(clean)
    except Exception as e:
        print(f"Repair failed: {e}")
        return feedback # Return original if repair crashes logic
