import json
import re

def safe_json_parse(raw_text: str, default_obj: dict) -> dict:
    """
    Attempts to robustly parse JSON from an LLM response.
    Returns default_obj if all parsing fails.
    """
    try:
        # Attempt 1: Direct Parse
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass
        
    try:
        # Attempt 2: Regex extraction (find first { to last })
        json_match = re.search(r'(\{.*\})', raw_text, re.DOTALL)
        if json_match:
            clean_json = json_match.group(1)
            return json.loads(clean_json)
    except Exception:
        pass
        
    try:
        # Attempt 3: Aggressive cleanup (remove markdown blocks)
        clean_text = raw_text.replace("```json", "").replace("```", "").strip()
        # Find first { to last }
        start = clean_text.find('{')
        end = clean_text.rfind('}')
        if start != -1 and end != -1:
            clean_json = clean_text[start:end+1]
            return json.loads(clean_json)
    except Exception:
        pass
        
    print(f"WARNING: safe_json_parse failed completely. Returning default object.")
    return default_obj
