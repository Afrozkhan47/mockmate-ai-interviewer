from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base

class InterviewSessionORM(Base):
    __tablename__ = 'interview_sessions'

    id = Column(String, primary_key=True)  # using session_id (UUID str)
    user_id = Column(String, nullable=True) # For multi-user support / tracking
    role = Column(String, nullable=True)
    interview_type = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    resume_text = Column(Text, nullable=True) # PERSIST FOR GROWTH V2
    job_description = Column(Text, nullable=True) # PERSIST FOR GROWTH V2
    transcript = Column(Text, nullable=True) # PERSIST FOR GROWTH V2 (JSON string of QA history)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=True)  # COMPLETED or ENDED_EARLY

    summary = relationship("InterviewSummaryORM", back_populates="session", uselist=False, cascade="all, delete-orphan")

class InterviewSummaryORM(Base):
    __tablename__ = 'interview_summaries'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey('interview_sessions.id'), nullable=False, unique=True)

    overview = Column(Text, nullable=False)
    strengths = Column(Text, nullable=False)  # JSON-like string or newline separated
    improvements = Column(Text, nullable=False)
    focus_recommendation = Column(Text, nullable=False)
    structured_data = Column(Text, nullable=True)  # JSON storage for new feedback engine
    growth_data = Column(Text, nullable=True)  # LEGACY storage for tutor-style insights

    session = relationship("InterviewSessionORM", back_populates="summary")

class UserGrowthORM(Base):
    __tablename__ = 'user_growth'

    user_id = Column(String, primary_key=True) # One entry per user, overwritten
    growth_data = Column(Text, nullable=False) # JSON storage for Context-Aware Engine v2
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
