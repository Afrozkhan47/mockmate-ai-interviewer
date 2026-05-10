from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class InterviewState(str, Enum):
    WARM_UP = "WARM_UP"
    CONTEXT_ALIGNMENT = "CONTEXT_ALIGNMENT"
    DEPTH_EVALUATION = "DEPTH_EVALUATION"
    TIME_COMPRESSION = "TIME_COMPRESSION"
    WRAP_UP = "WRAP_UP"
    END = "END"

class QAPair(BaseModel):
    question: str
    answer: str

class SessionStartRequest(BaseModel):
    resume_text: str
    job_description: str
    interview_type: str
    total_duration: int  # in minutes
    difficulty: str
    user_name: Optional[str] = None

class SessionAnswerRequest(BaseModel):
    session_id: str
    answer: str

class SummaryResponse(BaseModel):
    overview: str
    strengths: List[str]
    improvements: List[str]
    recommendations: List[str]
    session_id: Optional[str] = None
    summary_id: Optional[str] = None
    structured_feedback: Optional[Dict] = None
    growth_insight: Optional[Dict[str, Any]] = None  # Structured tutor insights

# New Models for Type Safety (Optional but good for documentation)
class CategoryScore(BaseModel):
    score: int
    justification: str

class SkillSignal(BaseModel):
    skill: str
    signal: str
    evidence: str

class FeedbackAssessment(BaseModel):
    verdict: str
    confidence_level: int
    summary: str

class StructuredFeedback(BaseModel):
    overall_assessment: FeedbackAssessment
    category_scores: Dict[str, CategoryScore]
    skill_signals: List[SkillSignal]
    strengths: List[Dict[str, str]]
    weaknesses: List[Dict[str, str]]
    missed_opportunities: List[Dict[str, str]]
    red_flags: List[Dict[str, str]]
    improvement_plan: Dict[str, List[Dict[str, str]]]
    interviewer_notes: Dict[str, List[str]]
    meta: Dict[str, Any] = Field(default_factory=dict)

class InterviewResponse(BaseModel):
    session_id: str
    question: Optional[str] = None
    state: InterviewState
    is_final: bool = False
    remaining_time_percentage: float

class InterviewHistoryItem(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    role: Optional[str] = None
    interview_type: str
    duration_minutes: int
    started_at: float
    ended_at: Optional[float] = None
    status: str
    summary_id: Optional[str] = None

class AnswerEvaluation(BaseModel):
    answer_quality: str
    follow_up_required: bool
    current_topic: str
    missing_concepts: List[str]
    candidate_strengths: List[str]
    candidate_weaknesses: List[str]
    difficulty_adjustment: str
    reasoning: str

class InterviewPlan(BaseModel):
    skills_to_test: List[str]
    topic_order: List[str]
    resume_projects_to_probe: List[str]
    behavioral_focus: List[str]
    difficulty_strategy: Dict[str, str]

class InterviewSession(BaseModel):
    session_id: str
    user_id: str = "default" # For persistence tracking
    start_timestamp: float
    ended_timestamp: Optional[float] = None
    total_duration_minutes: int
    resume_text: Optional[str] = None
    job_description: Optional[str] = None
    interview_type: str
    difficulty: str
    user_name: Optional[str] = "Candidate"
    role: Optional[str] = "the role"
    
    current_state: InterviewState = InterviewState.WARM_UP
    history: List[QAPair] = Field(default_factory=list)
    question_count_in_state: int = 0
    question_count_total: int = 0
    last_question: Optional[str] = None
    
    # Topic Tracking
    current_topic_index: int = 0
    current_topic: str = "Introductions"
    follow_up_depth: int = 0
    
    # State tracking
    status: str = "IN_PROGRESS" # IN_PROGRESS, COMPLETED, ENDED_EARLY
    plan: Optional[InterviewPlan] = None
    last_evaluation: Optional[AnswerEvaluation] = None
    summary: Optional[SummaryResponse] = None
    summary_id: Optional[str] = None

# Growth Insight Specific Models
class QAReviewItem(BaseModel):
    question_asked: str
    user_answer_summarized: str
    interviewer_evaluation: str
    strong_answer_example: str
    how_to_improve: str

class GrowthInsight(BaseModel):
    # Section 1: Overview
    interview_type: str
    strongest_skill: str
    weakest_skill: str
    primary_growth_focus: str
    
    # Section 2: Core Q&A Review
    qa_review: List[QAReviewItem]
    
    # Section 3: Practice Plan
    practice_tasks: List[str]
    
    # Section 4: Model Answer
    model_answer_question: Optional[str] = None
    model_answer_content: Optional[str] = None
