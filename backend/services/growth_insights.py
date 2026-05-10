import json
import os
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import InterviewSessionORM, InterviewSummaryORM, UserGrowthORM

async def generate_growth_insight_for_user(db: Session, user_id: str, llm: Any) -> Dict[str, Any]:
    """
    Upgraded Growth Engine v2: Generates context-aware coaching insights.
    Analyzes last 5 sessions (transcripts, feedback, JD, Resume).
    Saves results to UserGrowthORM.
    """
    # Simple session count for generation rule
    session_count = db.query(InterviewSessionORM).filter(InterviewSessionORM.user_id == user_id).count()

    if session_count < 2:
        return {
            "locked": True,
            "num_completed": session_count,
            "message": "Complete at least 2 interviews to unlock context-aware coaching."
        }

    # 1. Fetch last 5 completed sessions for this user for context
    sessions = (
        db.query(InterviewSessionORM)
        .filter(InterviewSessionORM.user_id == user_id)
        .filter(InterviewSessionORM.status.in_(["COMPLETED", "ENDED_EARLY"]))
        .order_by(InterviewSessionORM.started_at.desc())
        .limit(5)
        .all()
    )

    # 2. Collect Context
    # We want oldest to newest for the LLM to see progression
    chronological_sessions = sessions[::-1]
    
    transcripts = []
    evaluation_history = []
    latest_resume = chronological_sessions[-1].resume_text or "Not provided"
    latest_jd = chronological_sessions[-1].job_description or "Not provided"
    
    for idx, s in enumerate(chronological_sessions):
        # Transcript
        t_str = s.transcript or "[]"
        try:
            t_data = json.loads(t_str)
            friendly_t = "\n".join([f"Q: {item['question']}\nA: {item['answer']}" for item in t_data])
            transcripts.append(f"--- SESSION {idx+1} ({s.interview_type}) ---\n{friendly_t}")
        except:
            transcripts.append(f"--- SESSION {idx+1} ---\n[Transcript unavailable]")
            
        # Feedback
        if s.summary and s.summary.structured_data:
            try:
                fb = json.loads(s.summary.structured_data)
                evaluation_history.append(f"Session {idx+1} Verdict: {fb.get('overall_assessment', {}).get('verdict', 'N/A')}")
                evaluation_history.append(f"Strengths: {', '.join([p.get('point', '') for p in fb.get('strengths', [])])}")
                evaluation_history.append(f"Weaknesses: {', '.join([p.get('point', '') for p in fb.get('weaknesses', [])])}")
            except:
                pass

    # 3. Call LLM with v2 Prompt
    prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/growth_insight_v2.txt")
    try:
        with open(prompt_path, "r") as f:
            template = f.read()
    except Exception as e:
        print(f"Error loading v2 prompt: {e}")
        return {"error": "Prompt template missing"}

    final_prompt = (
        template.replace("{resume}", latest_resume)
        .replace("{jd}", latest_jd)
        .replace("{transcripts}", "\n\n".join(transcripts))
        .replace("{evaluation_history}", "\n".join(evaluation_history))
    )

    try:
        raw_response = await llm.generate_question(final_prompt)
        
        # Robust JSON extraction
        json_match = re.search(r'(\{.*\})', raw_response, re.DOTALL)
        if json_match:
            clean_json = json_match.group(1)
        else:
            clean_json = raw_response.strip()
            
        growth_data = json.loads(clean_json)
        
        # Post-processing: Ensure exactly 7 steps
        if "improvement_plan_7_day" in growth_data:
            plan = growth_data["improvement_plan_7_day"]
            if len(plan) > 7:
                growth_data["improvement_plan_7_day"] = plan[:7]
            while len(growth_data["improvement_plan_7_day"]) < 7:
                growth_data["improvement_plan_7_day"].append("Review your transcript for more specific improvement areas.")
        
        # 4. Save to UserGrowthORM (UPSERT)
        existing = db.query(UserGrowthORM).filter(UserGrowthORM.user_id == user_id).first()
        if existing:
            existing.growth_data = json.dumps(growth_data)
            existing.updated_at = None # Trigger onupdate
        else:
            new_growth = UserGrowthORM(user_id=user_id, growth_data=json.dumps(growth_data))
            db.add(new_growth)
        
        db.commit()
        return growth_data

    except Exception as e:
        print(f"CRITICAL: Failed to generate growth insight v2: {e}")
        db.rollback()
        return {"error": str(e)}

def get_growth_insights(db: Session, user_id: str = "default") -> Dict[str, Any]:
    """
    Fetches stored growth insights for a user.
    Source of truth: presence of a record in UserGrowthORM.
    """
    growth_record = db.query(UserGrowthORM).filter(UserGrowthORM.user_id == user_id).first()
    
    # Simple count for display purposes only
    session_count = db.query(InterviewSessionORM).filter(InterviewSessionORM.user_id == user_id).count()

    # IF record exists -> UNLOCKED
    if growth_record:
        try:
            data = json.loads(growth_record.growth_data)
            data["locked"] = False
            data["num_completed"] = session_count
            return data
        except Exception as e:
            print(f"Error parsing growth data: {e}")
            return {"error": "Data corruption"}

    # IF no record -> LOCKED
    return {
        "locked": True,
        "num_completed": session_count,
        "message": "Complete at least 2 interviews to unlock context-aware coaching insights."
    }
