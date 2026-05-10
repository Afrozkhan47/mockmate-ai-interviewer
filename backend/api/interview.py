import io
import time
import uuid
import os
import asyncio
import re
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pypdf import PdfReader

from schemas import (
    InterviewResponse, 
    InterviewState, 
    InterviewSession, 
    SessionStartRequest, 
    SessionAnswerRequest,
    QAPair,
    SummaryResponse,
    InterviewHistoryItem,
    InterviewPlan,
    AnswerEvaluation,
)
from llm.groq import GroqProvider
from config import settings
from sqlalchemy.orm import Session, joinedload
from fastapi import Depends
from database import get_db, SessionLocal
from models import InterviewSessionORM, InterviewSummaryORM, UserGrowthORM
from services.feedback_validation import validate_feedback, repair_feedback_with_llm
from datetime import datetime, timedelta
from services.growth_insights import get_growth_insights
from services.interview_planner import generate_interview_plan
from services.answer_evaluator import evaluate_answer
from services.question_generator import generate_next_question


router = APIRouter()

# In-memory session store retained for live flow only
sessions: Dict[str, InterviewSession] = {}

MAX_RESUME_CHARS = 8000
MAX_JOB_DESC_CHARS = 3000
PROMPT_RESUME_CHARS = 2500
PROMPT_JOB_DESC_CHARS = 1200

def _sanitize_text(text: Optional[str], limit: int) -> str:
    if not text:
        return ""
    cleaned = "".join(char for char in text if char.isprintable() or char in "\n\r\t")
    return cleaned.strip()[:limit]

def _derive_role_label(job_description: Optional[str], fallback: str = "the role") -> str:
    """
    Create a short, readable role label from user-provided JD text.
    Prevents long JD blobs from leaking into strengths/recommendations.
    """
    if not job_description:
        return fallback
    text = _sanitize_text(job_description, 240)
    # Cut off common boilerplate sections often pasted with internship listings.
    text = re.split(r"(START DATE|APPLY BY|STIPEND|DURATION|RESPONSIBILITIES|REQUIREMENTS)", text, maxsplit=1)[0].strip()
    # Prefer first sentence/chunk.
    text = re.split(r"[.;\n]", text, maxsplit=1)[0].strip()
    # Keep clean and short.
    text = re.sub(r"\s+", " ", text)
    return text[:80].strip() or fallback

def _clean_feedback_point(text: str, role_context: str) -> str:
    """
    Normalize feedback points to avoid unsupported hard-negative claims and JD pasting.
    """
    cleaned = _sanitize_text(text, 220)
    # If the point is mostly giant JD text, replace with a concise version.
    if len(cleaned) > 140:
        cleaned = f"Demonstrated engagement with expectations for {role_context}"
    # Avoid unsupported absolute negatives.
    cleaned = re.sub(r"\blimited experience\b", "can further demonstrate depth", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\black of\b", "opportunity to strengthen", cleaned, flags=re.IGNORECASE)
    return cleaned

def get_llm_provider():
    return GroqProvider()

def load_system_prompt():
    try:
        path = os.path.join(os.path.dirname(__file__), "../prompts/interviewer.txt")
        with open(path, "r") as f:
            return f.read()
    except Exception as e:
        print(f"Error loading prompt: {e}")
        return "You are an interviewer. Ask a relevant question."

@router.post("/extract-text")
async def extract_text_from_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for extraction.")
    
    try:
        contents = await file.read()
        f = io.BytesIO(contents)
        reader = PdfReader(f)
        
        extracted_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
        
        clean_text = "".join(char for char in extracted_text if char.isprintable() or char in "\n\r\t").strip()
        
        if len(clean_text) < 50:
             raise HTTPException(status_code=400, detail="The extracted text is too short. Please ensure the PDF contains readable text and is not just an image.")
             
        return {"text": clean_text}
    except Exception as e:
        print(f"CRITICAL: PDF Extraction Error: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Backend failed to extract text from your resume. Error: {str(e)}"
        )

def _get_user_memory(db: Session, user_id: str) -> str:
    """
    Fetch recurring weaknesses and focus areas for a candidate from the Growth Engine.
    Used to provide cross-interview 'Memory'.
    """
    try:
        record = db.query(UserGrowthORM).filter(UserGrowthORM.user_id == user_id).first()
        if not record:
            return ""
        
        import json
        data = json.loads(record.growth_data)
        
        memory_parts = []
        
        # 1. Consistent Strengths (to acknowledge)
        strengths = data.get("consistent_strengths", [])
        if strengths:
            memory_parts.append(f"PAST STRENGTHS: {', '.join(strengths[:2])}")
            
        # 2. Recurring Improvements (PRIMARY MEMORY FOCUS)
        improvements = data.get("recurring_improvements", [])
        if improvements:
            memory_parts.append(f"RECURRING WEAKNESSES: {', '.join(improvements[:2])}")
            
        # 3. Recommended Focus
        focus = data.get("recommended_focus", "")
        if focus:
            memory_parts.append(f"PREVIOUS COACHING FOCUS: {focus}")
            
        if not memory_parts:
            return ""
            
        return "\n[PAST PERFORMANCE MEMORY]\n" + "\n".join(memory_parts) + "\n"
    except Exception as e:
        print(f"Warning: Failed to fetch memory for {user_id}: {e}")
        return ""

def _calculate_next_state(session: InterviewSession) -> InterviewState:
    elapsed_time = time.time() - session.start_timestamp
    total_time_seconds = session.total_duration_minutes * 60
    time_percentage = elapsed_time / total_time_seconds if total_time_seconds > 0 else 1.0
    
    current = session.current_state
    
    if current == InterviewState.WARM_UP:
        # STRICT: Must complete at least 3 warm-up questions or 15% time
        if session.question_count_in_state >= 3:
            return InterviewState.CONTEXT_ALIGNMENT
            
    elif current == InterviewState.CONTEXT_ALIGNMENT:
        if session.question_count_in_state >= 2 or time_percentage >= 0.30:
            return InterviewState.DEPTH_EVALUATION
            
    elif current == InterviewState.DEPTH_EVALUATION:
        if time_percentage >= 0.75:
            return InterviewState.TIME_COMPRESSION
            
    elif current == InterviewState.TIME_COMPRESSION:
        if time_percentage >= 0.90:
            return InterviewState.WRAP_UP
            
    elif current == InterviewState.WRAP_UP:
        if session.question_count_in_state >= 1 or time_percentage >= 1.0:
            return InterviewState.END
            
    return current

def _generate_authoritative_prompt(session: InterviewSession, system_prompt: str, memory_context: str = "") -> str:
    elapsed_time = time.time() - session.start_timestamp
    total_time_seconds = session.total_duration_minutes * 60
    remaining_seconds = max(0, total_time_seconds - elapsed_time)
    
    history_text = "\n[CONVERSATION HISTORY]\n"
    if not session.history:
        history_text += "(Start of interview)\n"
    for qa in session.history:
        history_text += f"Interviewer: {qa.question}\nCandidate: {qa.answer}\n"

    # Specific directives for WARM_UP phase to ensure consistency
    warm_up_directive = ""
    if session.current_state == InterviewState.WARM_UP:
        if session.question_count_in_state == 0:
            warm_up_directive = "GREET the candidate by name and ask: 'Tell me about yourself and your professional background.'"
        elif session.question_count_in_state == 1:
            warm_up_directive = "Ask: 'Why are you interested in this internship / role specifically?'"
        elif session.question_count_in_state == 2:
            warm_up_directive = "Transitioning to their resume, ask: 'I see your experience in your resume - can you elaborate on a key project you've mentioned there?'"

    time_context = f"""
[SESSION STATUS]
- State: {session.current_state}
- Total Duration: {session.total_duration_minutes}m
- Time Elapsed: {int(elapsed_time // 60)}m {int(elapsed_time % 60)}s
- Remaining Time: {int(remaining_seconds // 60)}m {int(remaining_seconds % 60)}s
- Progressive Index: {session.question_count_total + 1}
"""

    prompt_resume = _sanitize_text(session.resume_text, PROMPT_RESUME_CHARS)
    prompt_job_description = _sanitize_text(session.job_description, PROMPT_JOB_DESC_CHARS)

    return f"""
{system_prompt}

{memory_context}

{time_context}

[INTERVIEW TYPE]
{session.interview_type}

[DIFFICULTY]
{session.difficulty}

[JOB DESCRIPTION]
{prompt_job_description}

[CANDIDATE RESUME]
{prompt_resume}

[CANDIDATE NAME]
{session.user_name or "Candidate"}

{history_text}

[FINAL DIRECTIVE]
{warm_up_directive if warm_up_directive else f"Generate the NEXT interview question for the current state: {session.current_state}."}
Refer to the prompt rules for how to behave in this state.
Ask ONLY the question text.
"""

def _fallback_question(session: InterviewSession) -> str:
    state = session.current_state
    turn = session.question_count_in_state

    if state == InterviewState.WARM_UP:
        if turn == 0:
            return f"{session.user_name or 'Candidate'}, tell me about yourself and your background."
        if turn == 1:
            return "What motivates you to apply for this role right now?"
        return "Can you walk me through one project you are most proud of and why?"

    if state == InterviewState.CONTEXT_ALIGNMENT:
        return "How does your prior experience align with the key responsibilities in this role?"

    if state == InterviewState.DEPTH_EVALUATION:
        return "Describe a technically challenging problem you solved, including your approach and trade-offs."

    if state == InterviewState.TIME_COMPRESSION:
        return "In two minutes, summarize your strongest value proposition for this role."

    if state == InterviewState.WRAP_UP:
        return "What is one area you are actively improving, and how are you measuring progress?"

    return "Please share any final thoughts before we conclude this interview."

async def _generate_summary_with_timeout(
    session: InterviewSession,
    llm: GroqProvider,
    db: Session,
    timeout_seconds: float = 5.0
) -> None:
    """
    Best-effort summary generation with timeout protection.
    Prevents API endpoints from hanging when LLM/network is slow.
    """
    try:
        await asyncio.wait_for(_generate_and_persist_summary(session, llm, db), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        print(f"WARNING: Summary generation timed out for {session.session_id}; defer to on-demand summary endpoint.")
    except Exception as e:
        print(f"WARNING: Summary generation failed for {session.session_id}: {e}")

@router.post("/start", response_model=InterviewResponse)
async def start_interview(
    request: SessionStartRequest,
    llm: GroqProvider = Depends(get_llm_provider)
    
):
    session_id = str(uuid.uuid4())
    # --- GROQ FREE TIER SAFEGUARD ---
    # Groq free tier limits are 6000 TPM (Tokens Per Minute). 
    # To prevent 413 Request Too Large errors on large PDFs, we truncate the texts here.
    safe_resume = _sanitize_text(request.resume_text, MAX_RESUME_CHARS)
    safe_job = _sanitize_text(request.job_description, MAX_JOB_DESC_CHARS)

    session = InterviewSession(
        session_id=session_id,
        user_id=request.user_name or "default", # PERSIST FOR GROWTH V2 TRACKING
        start_timestamp=time.time(),
        total_duration_minutes=request.total_duration,
        resume_text=safe_resume,
        job_description=safe_job,
        interview_type=request.interview_type,
        difficulty=request.difficulty,
        user_name=request.user_name or "Candidate",
        role=_derive_role_label(safe_job, "the role"),
    )

    sessions[session_id] = session
    # Persist InterviewSession at START (CRITICAL) - Use get_or_create pattern to prevent duplicates
    db = SessionLocal()
    try:
        # Check if session already exists (should never happen, but safeguard)
        db_obj = db.get(InterviewSessionORM, session_id)
        if db_obj:
            print(f"WARNING: Session {session_id} already exists in DB. Skipping creation.")
        else:
            db_obj = InterviewSessionORM(
                id=session_id,
                user_id=request.user_name or "default", # Use user_name as proxy for user_id in this simple setup
                role=session.role,
                interview_type=session.interview_type,
                duration_minutes=session.total_duration_minutes,
                resume_text=safe_resume, # Persist sanitized and bounded payload
                job_description=safe_job, # Persist sanitized and bounded payload
                started_at=datetime.fromtimestamp(session.start_timestamp),
                ended_at=None,
                status="IN_PROGRESS",
            )
            db.add(db_obj)
            db.commit()
            print(f"✓ Created session {session_id} in database with persisted context")
    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to persist session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create interview session: {str(e)}")
    finally:
        db.close()

    # --- NEW INTERVIEW PLANNER LAYER ---
    print(f"DEBUG: Generating Interview Plan for session {session_id}...")
    try:
        plan_data = await generate_interview_plan(
            llm=llm,
            resume=safe_resume,
            job_description=safe_job,
            interview_type=request.interview_type,
            difficulty=request.difficulty
        )
        session.plan = InterviewPlan(**plan_data)
        
        # Temporary visibility for testing
        print("\n" + "="*50)
        print(f"DEBUG: GENERATED INTERVIEW PLAN (Session {session_id})")
        print("="*50)
        print(f"Skills to test: {session.plan.skills_to_test}")
        print(f"Topic order: {session.plan.topic_order}")
        print(f"Difficulty strategy: {session.plan.difficulty_strategy}")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"WARNING: Interview planner failed: {e}. Proceeding without plan.")

    # Initialize Topic State from Planner
    if session.plan and session.plan.topic_order:
        session.current_topic = session.plan.topic_order[0]
        session.current_topic_index = 0
    else:
        session.current_topic = "Introductions"
        session.current_topic_index = 0
        
    session.follow_up_depth = 0

    # Generate first question using the new generator service
    try:
        question = await generate_next_question(
            llm=llm,
            current_topic=session.current_topic,
            latest_question="",
            candidate_answer="",
            evaluation_results=None,
            difficulty=session.difficulty,
            is_follow_up=False
        )
    except Exception as e:
        print(f"WARNING: LLM unavailable during /start for {session_id}: {e}. Using fallback question.")
        question = _fallback_question(session)

    # Simple cleanup
    clean_question = question.replace("Question:", "").replace("Interviewer:", "").strip()

    session.last_question = clean_question
    session.question_count_total += 1
    session.question_count_in_state += 1

    return InterviewResponse(
        session_id=session_id,
        question=clean_question,
        state=session.current_state,
        remaining_time_percentage=1.0
    )

@router.post("/answer", response_model=InterviewResponse)
async def answer_question(
    request: SessionAnswerRequest,
    llm: GroqProvider = Depends(get_llm_provider),
    db: Session = Depends(get_db)
):
    # Guard against null/empty session_id
    if not request.session_id or request.session_id == "null" or request.session_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid session_id")
    
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session = sessions[request.session_id]
    
    # Check if interview is already over (idempotent check)
    if session.current_state == InterviewState.END:
         return InterviewResponse(
            session_id=session.session_id,
            state=session.current_state,
            is_final=True,
            remaining_time_percentage=0.0
        )

    # 1. Store the answer to the previous question
    if session.last_question:
        session.history.append(QAPair(question=session.last_question, answer=request.answer))

    # --- NEW ANSWER EVALUATOR LAYER ---
    if session.last_question:
        print(f"DEBUG: Evaluating answer for session {session.session_id}...")
        
        # Determine current topic (safely from plan if available, or fallback)
        current_topic = "General"
        if session.plan and session.plan.topic_order:
            # Very basic fallback for topic identification for now
            # In the future, the evaluator or generator can explicitly track the active index
            topic_idx = min(len(session.plan.topic_order) - 1, session.question_count_in_state)
            current_topic = session.plan.topic_order[topic_idx]

        try:
            eval_data = await evaluate_answer(
                llm=llm,
                latest_question=session.last_question,
                candidate_answer=request.answer,
                current_topic=current_topic,
                interview_type=session.interview_type,
                difficulty=session.difficulty
            )
            session.last_evaluation = AnswerEvaluation(**eval_data)
            
            # Temporary visibility for testing
            print("\n" + "="*50)
            print(f"DEBUG: GENERATED EVALUATION (Session {session.session_id})")
            print("="*50)
            print(f"Quality: {session.last_evaluation.answer_quality}")
            print(f"Follow up required: {session.last_evaluation.follow_up_required}")
            print(f"Missing concepts: {session.last_evaluation.missing_concepts}")
            print(f"Difficulty adj: {session.last_evaluation.difficulty_adjustment}")
            print(f"Reasoning: {session.last_evaluation.reasoning}")
            print("="*50 + "\n")
            
        except Exception as e:
            print(f"WARNING: Answer evaluator failed: {e}. Proceeding without evaluation.")

    
    # 2. Update state machine
    old_state = session.current_state
    new_state = _calculate_next_state(session)
    
    if new_state != old_state:
        session.current_state = new_state
        session.question_count_in_state = 0
    
    # 3. Handle Termination - ATOMIC: Only finalize if not already finalized
    if session.current_state == InterviewState.END:
        # Use a lock-like pattern: only finalize if not already done
        if not session.ended_timestamp:
            session.ended_timestamp = time.time()
            session.status = "COMPLETED"
            
            # Update database session to COMPLETED (should always exist from /start)
            db_obj = db.get(InterviewSessionORM, session.session_id)
            if not db_obj:
                # This should NEVER happen if /start worked correctly
                print(f"CRITICAL ERROR: Session {session.session_id} not found in database at END state.")
                raise HTTPException(status_code=500, detail="Session data inconsistency detected")
            
            # Atomic update: only update if not already completed
            if db_obj.status != "COMPLETED" and db_obj.status != "ENDED_EARLY":
                db_obj.ended_at = datetime.fromtimestamp(session.ended_timestamp)
                db_obj.status = "COMPLETED"
                # Save full transcript for Growth Insights v2
                import json
                transcript_data = [{"question": qa.question, "answer": qa.answer} for qa in session.history]
                db_obj.transcript = json.dumps(transcript_data)
                
                db.commit()
                print(f"✓ Finalized session {session.session_id} as COMPLETED with transcript")
            else:
                print(f"Session {session.session_id} already finalized with status {db_obj.status}")
            
            # Auto-generate summary best-effort, without blocking request too long.
            await _generate_summary_with_timeout(session, llm, db, timeout_seconds=5.0)
        
        return InterviewResponse(
            session_id=session.session_id,
            state=session.current_state,
            is_final=True,
            remaining_time_percentage=0.0
        )
        
    # 4. Generate next question (Question Decision Engine)
    print(f"DEBUG: Running Question Decision Engine for session {session.session_id}...")
    is_follow_up = False
    
    # 4a. Make decision based on evaluation
    MAX_FOLLOW_UP_DEPTH = 3
    
    if session.last_evaluation:
        if session.last_evaluation.follow_up_required and session.follow_up_depth < MAX_FOLLOW_UP_DEPTH:
            session.follow_up_depth += 1
            is_follow_up = True
            print(f"DEBUG: Decision -> FOLLOW UP (Depth: {session.follow_up_depth}) on topic: {session.current_topic}")
        else:
            if session.follow_up_depth >= MAX_FOLLOW_UP_DEPTH:
                print(f"DEBUG: Decision -> FORCE NEXT TOPIC (Max follow-up depth reached on: {session.current_topic})")
            
            # Advance to next topic if available
            if session.plan and session.plan.topic_order:
                session.current_topic_index += 1
                if session.current_topic_index < len(session.plan.topic_order):
                    session.current_topic = session.plan.topic_order[session.current_topic_index]
                    print(f"DEBUG: Decision -> NEXT TOPIC: {session.current_topic}")
                else:
                    # Fallback if we run out of topics but time remains
                    session.current_topic = "General Experience and Projects"
                    print(f"DEBUG: Decision -> NEXT TOPIC (Fallback): {session.current_topic}")
            session.follow_up_depth = 0
            is_follow_up = False
    else:
        print("WARNING: No evaluation found, defaulting to next topic.")
        is_follow_up = False

    # 4b. Generate the question using the new service
    try:
        eval_dict = session.last_evaluation.model_dump() if session.last_evaluation else None
        question = await generate_next_question(
            llm=llm,
            current_topic=session.current_topic,
            latest_question=session.last_question or "",
            candidate_answer=request.answer,
            evaluation_results=eval_dict,
            difficulty=session.difficulty,
            is_follow_up=is_follow_up
        )

    except Exception as e:
        print(f"WARNING: LLM unavailable during /answer for {session.session_id}: {e}. Using fallback question.")
        question = _fallback_question(session)
    
    clean_question = question.replace("Question:", "").replace("Interviewer:", "").strip()
    
    # Update session tracking
    session.last_question = clean_question
    session.question_count_total += 1
    session.question_count_in_state += 1
    
    elapsed_time = time.time() - session.start_timestamp
    total_time_seconds = session.total_duration_minutes * 60
    remaining_perc = max(0, 1.0 - (elapsed_time / total_time_seconds)) if total_time_seconds > 0 else 0
    
    return InterviewResponse(
        session_id=session.session_id,
        question=clean_question,
        state=session.current_state,
        is_final=False,
        remaining_time_percentage=remaining_perc
    )
def load_summarizer_prompt():
    try:
        path = os.path.join(os.path.dirname(__file__), "../prompts/summarizer.txt")
        with open(path, "r") as f:
            return f.read()
    except Exception as e:
        print(f"Error loading summarizer prompt: {e}")
        return "Summarize the interview based on history."

def load_growth_insight_prompt():
    try:
        path = os.path.join(os.path.dirname(__file__), "../prompts/growth_insight.txt")
        with open(path, "r") as f:
            return f.read()
    except Exception as e:
        print(f"Error loading growth insight prompt: {e}")
        return ""

async def _generate_and_persist_summary(
    session: InterviewSession,
    llm: GroqProvider,
    db: Session
) -> SummaryResponse:
    """
    Generate and persist summary for a completed interview session.
    Works from in-memory session data.
    Returns the generated summary or raises HTTPException on failure.
    IDEMPOTENT: If summary already exists, returns it without regenerating.
    """
    # IDEMPOTENCY CHECK: If summary already exists, return it immediately
    db_sum = db.query(InterviewSummaryORM).filter(InterviewSummaryORM.session_id == session.session_id).first()
    if db_sum:
        strengths_list = [s.replace("• ", "").strip() for s in db_sum.strengths.split("\n") if s.strip()]
        improvements_list = [s.replace("• ", "").strip() for s in db_sum.improvements.split("\n") if s.strip()]
        recommendations_list = [s.replace("• ", "").strip() for s in db_sum.focus_recommendation.split("\n") if s.strip()]
        
        # Load growth data if available
        growth_insight_obj = None
        if db_sum.growth_data:
            try:
                growth_insight_obj = json.loads(db_sum.growth_data)
            except:
                pass

        # Compatibility check for history mapping
        import json
        structured = None
        if db_sum.structured_data:
            try:
                structured = json.loads(db_sum.structured_data)
            except:
                pass

        print(f"✓ Summary already exists for {session.session_id}, returning existing")
        return SummaryResponse(
            overview=db_sum.overview,
            strengths=strengths_list,
            improvements=improvements_list,
            recommendations=recommendations_list,
            session_id=session.session_id,
            summary_id=str(db_sum.id),
            structured_feedback=structured,
            growth_insight=growth_insight_obj
        )
    
    # Generate Summary
    system_prompt = load_summarizer_prompt()

    # Load NEW Structured Feedback Prompt
    try:
        with open("prompts/feedback.txt", "r") as f:
            template = f.read()
    except Exception:
        template = "GENERATE A JSON FEEDBACK"
        
    # Build transcript - handle empty or minimal history gracefully
    if not session.history or len(session.history) == 0:
        # If no history, create a minimal transcript from available data
        transcript = f"Interviewer: Tell me about yourself.\nCandidate: [Interview started but no answers recorded yet]"
        print(f"WARNING: Session {session.session_id} has no history, using minimal transcript")
    else:
        transcript = "\n".join([f"Interviewer: {item.question}\nCandidate: {item.answer}" for item in session.history])
    
    # If history is very short (1-2 Q&A pairs), add context about early termination
    history_note = ""
    if len(session.history) <= 2:
        history_note = "\n[NOTE: This interview ended very early with minimal conversation. Provide feedback based on available information and general interview best practices.]"
    
    # Construct Context with more specific instructions
    context = f"""
[INTERVIEW TYPE]
{session.interview_type}

[ROLE]
{session.role or 'Candidate'}

[DURATION]
{session.total_duration_minutes} minutes

[ENDED EARLY]
{session.status == "ENDED_EARLY"}

[TRANSCRIPT]
{transcript}
{history_note}

[STRICT REQUIREMENT]
- Overview MUST be a cohesive 3-4 sentence paragraph.
- Strengths MUST contain EXACTLY 4-5 bullet points (infer from resume/role if needed).
- Weaknesses MUST contain EXACTLY 3-4 bullet points (focus on general improvement areas if transcript is short).
- Improvement Plan MUST contain detailed, actionable items (minimum 5 actions total).
- Even with minimal transcript, provide meaningful, role-specific feedback.
"""
    
    final_prompt = template + "\n\n" + context
    
    # 1. Generate Feedback
    print(f"DEBUG: Generating structured feedback for {session.session_id}...")
    llm_unavailable = False
    try:
        raw_response = await llm.generate_question(final_prompt)
    except Exception as e:
        print(f"LLM Error: {e}")
        llm_unavailable = True
        raw_response = "{}"

    # 2. Parse JSON (HARDENED)
    try:
        import re
        import json
        
        # Robust JSON extraction using regex to find the FIRST outer-most curly-brace object
        json_match = re.search(r'(\{.*\})', raw_response, re.DOTALL)
        if json_match:
            clean_json = json_match.group(1)
        else:
            clean_json = raw_response.strip()
            # Basic cleanup if regex failed
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
        feedback_data = json.loads(clean_json)
        
        # VALIDATION & REPAIR LOOP
        is_early_ended = (session.status == "ENDED_EARLY")
        errors = validate_feedback(feedback_data, is_early_ended)
        
        if errors and not llm_unavailable:
            print(f"Validation failed: {errors}. Attempting repair...")
            for attempt in range(2): 
                feedback_data = await repair_feedback_with_llm(feedback_data, errors, llm)
                errors = validate_feedback(feedback_data, is_early_ended)
                if not errors:
                    print(f"Feedback repaired on attempt {attempt+1}")
                    break

        if errors:
            print("Proceeding with partial/invalid feedback (Fail-Soft).")
            if "meta" not in feedback_data:
                feedback_data["meta"] = {}
            feedback_data["meta"]["evaluation_confidence"] = "low"

        # 3. Map to Legacy Fields for UI Compatibility
        # Overview - Ensure it's always 3-4 sentences
        summary_text = feedback_data.get("overall_assessment", {}).get("summary", "")
        verdict = feedback_data.get("overall_assessment", {}).get("verdict", "hire").replace("_", " ").title()
        
        # Build structured overview: role, type, duration, completion status, verdict
        role_name = session.role or "the position"
        interview_type_name = session.interview_type or "technical"
        duration_str = f"{session.total_duration_minutes} minutes"
        completion_status = "completed successfully" if session.status == "COMPLETED" else "ended early"
        
        # If summary_text is good, use it; otherwise construct from context
        if summary_text and len(summary_text.split('.')) >= 3:
            overview = summary_text
        else:
            # Construct a proper 3-4 sentence overview
            overview = f"This {interview_type_name} interview for {role_name} lasted {duration_str} and {completion_status}. "
            overview += f"The candidate demonstrated engagement throughout the session, addressing questions about their background and technical expertise. "
            overview += f"Based on the evaluation, the overall verdict is: {verdict}. "
            if session.status == "ENDED_EARLY":
                overview += "Note: This interview ended early, so the assessment is based on the available conversation."
            else:
                overview += "The interview covered multiple phases including warm-up, context alignment, and technical depth evaluation."
        
        # Strengths (EXACTLY 4-5) - Performance-based target
        role_context = _derive_role_label(session.role or session.job_description, "the role")
        strengths_list = [
            _clean_feedback_point(s.get("point", "").strip(), role_context)
            for s in feedback_data.get("strengths", [])
            if s.get("point", "").strip()
        ]
        
        # Performance-based target
        is_good_performance = "hire" in verdict.lower()
        target_strengths = 5 if is_good_performance else 4
        target_weaknesses = 5 if not is_good_performance else 3

        # HEURISTIC: Pad with role-specific strengths if still short after repair
        if len(strengths_list) < target_strengths:
            padding = [
                f"Demonstrated professional engagement and genuine interest in {role_context}",
                "Clear and structured communication during technical explanations",
                f"Solid understanding of core concepts relevant to {role_context}",
                "Ability to organize thoughts and respond thoughtfully under interview pressure",
                f"Candidate effectively connected their prior experience to {role_context} requirements"
            ]
            needed = target_strengths - len(strengths_list)
            strengths_list.extend(padding[:needed])
        
        # Final trim/pad to match requested counts
        strengths_list = strengths_list[:target_strengths]
        strengths_str = "\n".join(["• " + s for s in strengths_list])
        
        # Improvements (EXACTLY 3-5) - Performance-based target
        weaknesses_list = [
            _clean_feedback_point(w.get("point", "").strip(), role_context)
            for w in feedback_data.get("weaknesses", [])
            if w.get("point", "").strip()
        ]
        if len(weaknesses_list) < target_weaknesses:
            padding = [
                f"Expand on specific technical sub-topics relevant to {role_context} for greater depth",
                "Maintain consistent pacing and clarity when explaining complex problem-solving approaches",
                "Provide more concrete, quantifiable examples when discussing past projects and achievements",
                f"Further align technical explanations with the scale and complexity expected in {role_context}",
                "Focus on articulating the 'why' behind architectural and tool choices more clearly"
            ]
            needed = target_weaknesses - len(weaknesses_list)
            weaknesses_list.extend(padding[:needed])
        
        weaknesses_list = weaknesses_list[:target_weaknesses]
        improvements_str = "\n".join(["• " + w for w in weaknesses_list])
        
        # Recommendation (EXACTLY 4-5 items) - Ensure practice-oriented, actionable
        rec_list = []
        for plan in ["next_7_days", "next_30_days"]:
            actions = feedback_data.get("improvement_plan", {}).get(plan, [])
            for a in actions:
                action_text = a.get("action", "").strip()
                if action_text:
                    rec_list.append(action_text)
        
        # If we don't have enough, add role-specific recommendations
        if len(rec_list) < 4:
            role_context = _derive_role_label(session.role or session.job_description, "the target role")
            interview_type_context = session.interview_type.lower() if session.interview_type else "technical"
            padding = [
                f"Review fundamental concepts and patterns relevant to {role_context}",
                f"Practice {interview_type_context} interview scenarios with time constraints",
                "Refine project presentation skills with emphasis on impact and technical depth",
                f"Deep dive into advanced topics specific to {role_context} requirements",
                "Schedule additional mock interviews to build confidence and refine responses"
            ]
            needed = 4 - len(rec_list)
            rec_list.extend(padding[:needed])
        
        # Ensure we have exactly 4-5 (prefer 5)
        recommendations = rec_list[:5] if len(rec_list) > 5 else rec_list
        if len(recommendations) < 4:
            recommendations.append("Continue practicing structured problem-solving and communication")
        recommendation_str = "\n".join(["• " + r for r in recommendations])
        
        print(f"DEBUG: Padded Strengths ({len(strengths_list)}): {strengths_list}")
        print(f"DEBUG: Padded Recommendations ({len(recommendations)}): {recommendations}")
        
        full_json_str = json.dumps(feedback_data)
        
        # Populate SummaryResponse
        summary_obj = SummaryResponse(
            overview=overview,
            strengths=strengths_list,
            improvements=weaknesses_list,
            recommendations=recommendations,
            session_id=session.session_id,
            summary_id=None,
            structured_feedback=feedback_data
        )

    except Exception as e:
        print(f"CRITICAL ERROR: Failed to parse/map feedback for {session.session_id}: {e}")
        overview = "The interview session was processed, but a detailed technical summary could not be generated at this time. Please see the insights below based on your performance."
        
        strengths_list = [
            "Demonstrated professional engagement and technical interest in the role", 
            "Clear communication during the core parts of the session",
            "Consistent focus on the job requirements during discussion",
            "Ability to adapt to the interviewer's technical questions",
            "Showed structured thinking when approaching problem statements"
        ]
        weaknesses_list = [
            "Deepen specific technical explanations for better impact",
            "Focus on trade-off analysis for architecture decisions",
            "Improve pacing and structure of technical responses",
            "Provide more concrete examples of impact in past roles"
        ]
        recommendations = [
            "Review role-specific interview preparation kits",
            "Practice live coding and whiteboarding scenarios",
            "Refine communication for complex technical topics",
            "Deep dive into the core technologies mentioned in JD",
            "Schedule a follow-up mock interview for more practice"
        ]
        
        summary_obj = SummaryResponse(
            overview=overview,
            strengths=strengths_list,
            improvements=weaknesses_list,
            recommendations=recommendations,
            session_id=session.session_id,
            summary_id=None
        )
        strengths_str = "• " + "\n• ".join(strengths_list)
        improvements_str = "• " + "\n• ".join(weaknesses_list)
        recommendation_str = "• " + "\n• ".join(recommendations)
        full_json_str = "{}"

    # 4. Persistence (ATOMIC UPSERT)
    try:
        # Check if exists
        existing = db.query(InterviewSummaryORM).filter(InterviewSummaryORM.session_id == session.session_id).first()
        if existing:
            existing.overview = summary_obj.overview
            existing.strengths = strengths_str
            existing.improvements = improvements_str
            existing.focus_recommendation = recommendation_str
            existing.structured_data = full_json_str
            sum_row = existing
        else:
            sum_row = InterviewSummaryORM(
                session_id=session.session_id,
                overview=summary_obj.overview,
                strengths=strengths_str,
                improvements=improvements_str,
                focus_recommendation=recommendation_str,
                structured_data=full_json_str
            )
            db.add(sum_row)

        # Persist summary first so downstream growth failures cannot roll this back.
        db.flush()
        db.commit()
        db.refresh(sum_row)
        summary_obj.summary_id = str(sum_row.id)
        session.summary_id = str(sum_row.id)
        session.summary = summary_obj
        
        print(f"✓ Summary {sum_row.id} persisted for {session.session_id}")
    except Exception as e:
        db.rollback()
        print(f"ERROR: Persistence failed: {e}")
        raise HTTPException(status_code=500, detail="Database persistence failed")

    # 5. Generate Growth Insight in a best-effort pass AFTER summary persistence.
    if not llm_unavailable:
        try:
            from services.growth_insights import generate_growth_insight_for_user
            user_id = getattr(session, 'user_id', None) or session.user_name or "default"
            await generate_growth_insight_for_user(db, user_id, llm)
            print(f"✓ Context-aware growth insight generated for user {user_id}")
        except Exception as ge:
            print(f"WARNING: Growth v2 generation failed for {session.session_id}: {ge}")
    else:
        print(f"Skipping growth insight generation for {session.session_id} because LLM is unavailable.")

    return summary_obj


# Safety finalization helper to ensure DB reflects completed in-memory sessions
# This is best-effort and should not block summary generation.
def _safety_finalize_session_if_needed(session_id: str, db: Session) -> None:
    try:
        sess = sessions.get(session_id)
        if not sess or sess.current_state != InterviewState.END:
            return
        db_obj = db.get(InterviewSessionORM, session_id)
        if db_obj and db_obj.status == "IN_PROGRESS":
            if db_obj.ended_at is None:
                db_obj.ended_at = datetime.utcnow()
            db_obj.status = "COMPLETED"
            db.commit()
    except Exception as e:
        print(f"Warning: safety finalization failed for {session_id}: {e}")

@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    session_id: str,
    llm: GroqProvider = Depends(get_llm_provider),
    db: Session = Depends(get_db)
):
    """
    Get summary for a completed interview session.
    
    Priority:
    1. Check database for existing summary (works after server restart)
    2. If in-memory session exists and at END state, generate and save summary
    3. Otherwise return 404
    
    This ensures SQLite is the single source of truth.
    """
    # Guard against null/empty session_id
    if not session_id or session_id == "null" or session_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid session_id")
    
    # Try database first (works regardless of server restarts)
    db_sum = db.query(InterviewSummaryORM).filter(InterviewSummaryORM.session_id == session_id).first()
    if db_sum:
        # Compatibility check for history mapping
        import json
        structured = None
        if db_sum.structured_data:
            try: structured = json.loads(db_sum.structured_data)
            except: pass

        growth_insight = None
        if db_sum.growth_data:
            try: growth_insight = json.loads(db_sum.growth_data)
            except: pass

        return SummaryResponse(
            overview=db_sum.overview,
            strengths=[s.replace("• ", "").strip() for s in db_sum.strengths.split("\n") if s.strip()],
            improvements=[s.replace("• ", "").strip() for s in db_sum.improvements.split("\n") if s.strip()],
            recommendations=[s.replace("• ", "").strip() for s in db_sum.focus_recommendation.split("\n") if s.strip()],
            session_id=session_id,
            summary_id=str(db_sum.id),
            structured_feedback=structured,
            growth_insight=growth_insight
        )
    
    # Fallback 1: check if in-memory session exists and can generate summary
    if session_id in sessions:
        session = sessions[session_id]
        
        # Only allow summary if state is END
        if session.current_state != InterviewState.END:
            raise HTTPException(status_code=400, detail="Summary can only be generated after the interview has ended.")
        
        # Generate and persist summary using helper function
        try:
            return await _generate_and_persist_summary(session, llm, db)
        except Exception as e:
            print(f"ERROR: Failed to generate summary from in-memory session {session_id}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
    
    # Fallback 2: Check if session exists in DB and is finalized, but no summary exists
    db_session = db.get(InterviewSessionORM, session_id)
    if db_session and db_session.status in ["COMPLETED", "ENDED_EARLY"]:
        # We can reconstruct from DB transcript if it exists
        if db_session.transcript:
            try:
                import json
                from schemas import QAPair
                t_data = json.loads(db_session.transcript)
                history = [QAPair(question=item["question"], answer=item["answer"]) for item in t_data]
                
                # Reconstruct minimal InterviewSession for the summarizer
                from schemas import InterviewSession as InterviewSessionSchema
                reconstructed_sess = InterviewSessionSchema(
                    session_id=session_id,
                    user_id=db_session.user_id or "default",
                    start_timestamp=db_session.started_at.timestamp() if db_session.started_at else time.time(),
                    total_duration_minutes=db_session.duration_minutes or 15,
                    resume_text=db_session.resume_text or "",
                    job_description=db_session.job_description or "",
                    interview_type=db_session.interview_type or "Technical",
                    difficulty="Intermediate",
                    user_name=db_session.user_id or "Candidate",
                    role=db_session.role or "Candidate",
                    history=history,
                    status=db_session.status
                )
                
                print(f"✓ Reconstructing session {session_id} from DB transcript for summary generation")
                return await _generate_and_persist_summary(reconstructed_sess, llm, db)
            except Exception as e:
                print(f"ERROR: Failed to reconstruct session from DB for {session_id}: {e}")
        
        # Fallback for sessions with no transcript
        print(f"Attempting to generate summary for finalized session {session_id} without transcript data")
        # In-memory session check already failed above, so we might be stuck here if no transcript.
        # But we can still try to generate a "minimal" summary if it's really needed.
    
    # No summary in DB and no in-memory session
    raise HTTPException(status_code=404, detail="Summary not found for this session")

# New Endpoints for Interview History
@router.get("/interviews/history", response_model=List[InterviewHistoryItem])
async def get_interview_history(db: Session = Depends(get_db)):
    """
    Get interview history, filtering out orphaned/abandoned sessions.
    Ensures no duplicates are returned.
    """
    # Optimization: Filter out orphans (IN_PROGRESS sessions older than 10 mins with no summary)
    ten_mins_ago = datetime.utcnow() - timedelta(minutes=10)
    
    # Query all sessions with summaries eagerly loaded, ordered by start time DESC
    rows = db.query(InterviewSessionORM).options(joinedload(InterviewSessionORM.summary)).order_by(InterviewSessionORM.started_at.desc()).all()
    
    # Track seen session_ids to prevent duplicates (defensive programming)
    seen_ids = set()
    items: List[InterviewHistoryItem] = []
    
    for r in rows:
        # Skip if we've already seen this session_id (shouldn't happen, but safeguard)
        if r.id in seen_ids:
            print(f"WARNING: Duplicate session_id {r.id} detected in history, skipping")
            continue
        seen_ids.add(r.id)
        
        # Status Logic: If it has a summary, it's 'Completed' regardless of original status
        display_status = r.status or "COMPLETED"
        if r.summary:
            display_status = "COMPLETED"
        elif r.status == "IN_PROGRESS" and r.started_at < ten_mins_ago:
            continue # Skip abandoned
                
        items.append(InterviewHistoryItem(
            session_id=r.id,
            user_id=None,
            role=_derive_role_label(r.role or r.job_description, "General Interview"),
            interview_type=r.interview_type,
            duration_minutes=r.duration_minutes,
            started_at=r.started_at.timestamp(),
            ended_at=r.ended_at.timestamp() if r.ended_at else None,
            status=display_status,
            summary_id=str(r.summary.id) if r.summary else None,
        ))
    return items

@router.patch("/interviews/{session_id}")
async def update_interview(session_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Update editable interview metadata from dashboard (role/type).
    """
    if not session_id or session_id in ["null", "undefined"]:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    row = db.get(InterviewSessionORM, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        if "role" in payload and isinstance(payload["role"], str):
            row.role = _derive_role_label(payload["role"], "General Interview")
        if "interview_type" in payload and isinstance(payload["interview_type"], str):
            row.interview_type = payload["interview_type"].strip()[:32] or row.interview_type
        db.commit()
        return {"status": "ok", "session_id": session_id}
    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to update session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update interview")

@router.delete("/interviews/{session_id}")
async def delete_interview(session_id: str, db: Session = Depends(get_db)):
    """
    Delete an interview session and its summary (if present).
    Safe to call for already-finished or in-progress sessions.
    """
    if not session_id or session_id in ["null", "undefined"]:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    row = db.get(InterviewSessionORM, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        db.delete(row)
        db.commit()
        # Clear from in-memory store as well.
        sessions.pop(session_id, None)
        return {"status": "ok", "deleted_session_id": session_id}
    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to delete session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session")

@router.get("/interview/growth")
async def get_growth_data(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Fetches growth insights for a user from persistent storage.
    """
    # Dashboard doesn't pass a user_id; provide global completed-progress in that case.
    if not user_id:
        completed_count = db.query(InterviewSessionORM).filter(
            InterviewSessionORM.status.in_(["COMPLETED", "ENDED_EARLY"])
        ).count()
        return {
            "locked": completed_count < 2,
            "num_completed": completed_count,
            "message": "Complete at least 2 interviews to unlock context-aware coaching insights."
            if completed_count < 2 else "Unlocked"
        }
    return get_growth_insights(db, user_id)

@router.post("/interviews/{session_id}/end")
async def end_interview_early(
    session_id: str, 
    db: Session = Depends(get_db),
    llm: GroqProvider = Depends(get_llm_provider)
):
    """
    Mark a session as ended early and persist.
    ATOMIC: Only finalize if not already finalized to prevent race conditions.
    """
    # Guard against null/empty session_id
    if not session_id or session_id == "null" or session_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid session_id")
    
    # Get database session first (source of truth)
    db_obj = db.get(InterviewSessionORM, session_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # ATOMIC CHECK: Only update if not already finalized
    if db_obj.status in ["COMPLETED", "ENDED_EARLY"]:
        print(f"Session {session_id} already finalized with status {db_obj.status}, skipping")
        return {"status": "ok", "message": "Session already finalized"}
    
    # Update in-memory session if it exists
    if session_id in sessions:
        sess = sessions[session_id]
        sess.current_state = InterviewState.END
        sess.ended_timestamp = sess.ended_timestamp or time.time()
        sess.status = "ENDED_EARLY"
    else:
        # If no in-memory session, try to reconstruct from DB transcript if summary is missing
        sess = None
        db_sum = db.query(InterviewSummaryORM).filter(InterviewSummaryORM.session_id == session_id).first()
        if not db_sum and db_obj.transcript:
            try:
                import json
                from schemas import QAPair
                from schemas import InterviewSession as InterviewSessionSchema
                t_data = json.loads(db_obj.transcript)
                history = [QAPair(question=item["question"], answer=item["answer"]) for item in t_data]
                
                sess = InterviewSessionSchema(
                    session_id=session_id,
                    user_id=db_obj.user_id or "default",
                    start_timestamp=db_obj.started_at.timestamp() if db_obj.started_at else time.time(),
                    total_duration_minutes=db_obj.duration_minutes or 15,
                    resume_text=db_obj.resume_text or "",
                    job_description=db_obj.job_description or "",
                    interview_type=db_obj.interview_type or "Technical",
                    difficulty="Intermediate",
                    user_name=db_obj.user_id or "Candidate",
                    role=db_obj.role or "Candidate",
                    history=history,
                    status=db_obj.status
                )
                print(f"✓ Reconstructed session {session_id} from DB transcript for auto-summary in EARLY END")
            except Exception as e:
                print(f"ERROR: Failed to reconstruct session from DB for early end {session_id}: {e}")

    # Update database (atomic)
    db_obj.ended_at = db_obj.ended_at or datetime.utcnow()
    db_obj.status = "ENDED_EARLY"
    
    # Save transcript if available
    if sess and sess.history:
        import json
        transcript_data = [{"question": qa.question, "answer": qa.answer} for qa in sess.history]
        db_obj.transcript = json.dumps(transcript_data)
        
    db.commit()
    print(f"✓ Finalized session {session_id} as ENDED_EARLY with transcript")

    # Final execution trigger if sess was found or reconstructed
    if sess:
        # Ensure session is properly marked as ended
        if not sess.ended_timestamp:
            sess.ended_timestamp = time.time()
        if not sess.status:
            sess.status = "ENDED_EARLY"
        # Generate summary best-effort with timeout so /end returns quickly.
        await _generate_summary_with_timeout(sess, llm, db, timeout_seconds=5.0)

    return {"status": "ok"}

@router.get("/interviews/{session_id}/summary", response_model=SummaryResponse)
async def get_interview_summary_by_id(session_id: str, llm: GroqProvider = Depends(get_llm_provider), db: Session = Depends(get_db)):
    """
    Get summary by session_id. Primary endpoint for frontend.
    """
    # Guard against null/empty session_id
    if not session_id or session_id == "null" or session_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid session_id")
    
    db_sum = db.query(InterviewSummaryORM).filter(InterviewSummaryORM.session_id == session_id).first()
    # Safety finalization: ensure DB session is completed if in-memory session ended
    _safety_finalize_session_if_needed(session_id, db)
    if db_sum:
        import json
        structured_feedback = None
        if db_sum.structured_data:
            try:
                structured_feedback = json.loads(db_sum.structured_data)
            except:
                pass

        # Load growth data
        growth_insight = None
        if db_sum.growth_data:
            try:
                growth_insight = json.loads(db_sum.growth_data)
            except:
                pass

        return SummaryResponse(
            overview=db_sum.overview,
            strengths=[s.replace("• ", "").strip() for s in db_sum.strengths.split("\n") if s.strip()],
            improvements=[s.replace("• ", "").strip() for s in db_sum.improvements.split("\n") if s.strip()],
            recommendations=[s.replace("• ", "").strip() for s in db_sum.focus_recommendation.split("\n") if s.strip()],
            session_id=session_id,
            summary_id=str(db_sum.id),
            structured_feedback=structured_feedback,
            growth_insight=growth_insight
        )

    # Fallback: Try to generate summary if session exists in memory
    if session_id in sessions:
        sess = sessions[session_id]
        if sess.current_state == InterviewState.END:
            try:
                return await get_summary(session_id=session_id, llm=llm, db=db)
            except Exception as e:
                print(f"ERROR: Failed to generate summary via get_summary for {session_id}: {e}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Interview session is not yet completed")

    raise HTTPException(status_code=404, detail="Summary not found for session")
