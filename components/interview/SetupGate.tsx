"use client";

import React, { useState, useEffect } from "react";

interface SetupGateProps {
    onStart: (config: InterviewConfig) => void;
}

export interface InterviewConfig {
    userName: string;
    resumeFile: File;
    resumeText: string;
    jobDescription: string;
    type: string;
    difficulty: string;
    duration: number; // minutes
}

const MAX_RESUME_TEXT_CHARS = 8000;
const MAX_JOB_DESCRIPTION_CHARS = 3000;

function normalizeAndClampText(text: string, limit: number): string {
    return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function SetupGate({ onStart }: SetupGateProps) {
    const [userName, setUserName] = useState("");
    const [resume, setResume] = useState<File | null>(null);
    const [resumeText, setResumeText] = useState("");
    const [jobDescription, setJobDescription] = useState("");

    // No defaults - active selection required
    const [type, setType] = useState<string | null>(null);
    const [difficulty, setDifficulty] = useState<string | null>(null);
    const [duration, setDuration] = useState<number | null>(null);
    const [isCustomDuration, setIsCustomDuration] = useState(false);

    // New State for Commitment
    const [isAgreed, setIsAgreed] = useState(false);
    const [isProcessingResume, setIsProcessingResume] = useState(false);

    // Animation State
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setResume(file);
            setIsProcessingResume(true);

            try {
                if (file.type === "application/pdf") {
                    const formData = new FormData();
                    formData.append("file", file);

                    const response = await fetch("/api/extract-text", {
                        method: "POST",
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || "Failed to extract text from PDF.");
                    }

                    const data = await response.json();
                    const boundedResumeText = normalizeAndClampText(data.text || "", MAX_RESUME_TEXT_CHARS);
                    setResumeText(boundedResumeText);
                } else {
                    // Plain text handling
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const text = (event.target?.result as string || "").trim();
                        if (text.length < 50) {
                            alert("The uploaded file doesn't seem to contain enough text context for the AI. Please ensure the content is readable.");
                            setResumeText("");
                            setResume(null);
                        } else {
                            setResumeText(normalizeAndClampText(text, MAX_RESUME_TEXT_CHARS));
                        }
                        setIsProcessingResume(false);
                    };
                    reader.readAsText(file);
                    return; // Early return as reader is async
                }
            } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                console.error("File Processing Error:", err);
                alert(err.message || "Error processing file.");
                setResume(null);
                setResumeText("");
            } finally {
                setIsProcessingResume(false);
            }
        }
    };

    const handleDurationSelect = (d: number | 'custom') => {
        if (d === 'custom') {
            setIsCustomDuration(true);
            setDuration(null); // Clear duration when custom is selected
        } else {
            setIsCustomDuration(false);
            setDuration(d);
        }
    };

    const isReady = userName.trim().length > 0 &&
        resume !== null &&
        resumeText.trim().length > 50 &&
        !isProcessingResume &&
        jobDescription.trim().length > 10 &&
        isAgreed &&
        type !== null &&
        difficulty !== null &&
        duration !== null;

    return (
        <div className="min-h-screen w-full bg-[#fcfcfc] py-20 px-6 overflow-y-auto">
            <div className={`max-w-3xl mx-auto space-y-20 transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

                {/* SECTION 1: CONTEXT */}
                <div className="text-center space-y-6">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">Before You Begin</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed font-medium">
                        You are entering a realistic simulation designed to test your focus and adaptability.
                        Please configure your session with the mindset of a real interview.
                    </p>
                </div>

                {/* SECTION 1.5: NAME */}
                <div className="space-y-6 animate-fadeIn">
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-gray-900 uppercase tracking-widest">0. Your Identity</h2>
                        <p className="text-base text-gray-500 mt-2 font-medium">How should we address you?</p>
                    </div>
                    <input
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="Enter your name..."
                        className="w-full max-w-md mx-auto block bg-white border border-gray-300 rounded-2xl p-4 text-center text-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all shadow-sm"
                    />
                </div>

                {/* SECTION 2: JOB CONTEXT */}
                <div className="space-y-6 animate-fadeIn delay-100">
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-gray-900 uppercase tracking-widest">1. Set the Context</h2>
                        <p className="text-base text-gray-500 mt-2 font-medium">What role are you interviewing for?</p>
                    </div>
                    <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value.slice(0, MAX_JOB_DESCRIPTION_CHARS))}
                        placeholder="Paste the full job description here (Responsibilities, Requirements, etc.)..."
                        className="w-full bg-white border border-gray-300 rounded-2xl p-6 text-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all shadow-sm min-h-[240px] resize-y"
                    />
                </div>

                {/* SECTION 3: RESUME */}
                <div className="space-y-6 animate-fadeIn delay-200">
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-gray-900 uppercase tracking-widest">2. Your Profile</h2>
                        <p className="text-base text-gray-500 mt-2 font-medium">Upload your resume to tailor the questions.</p>
                    </div>

                    <div className="relative group">
                        <div className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${resume ? 'border-green-500 bg-green-50/50' : 'border-gray-300 hover:border-gray-500 hover:bg-white'}`}>
                            <input
                                type="file"
                                accept=".pdf,.docx,.txt"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {isProcessingResume ? (
                                <div className="space-y-3">
                                    <div className="w-14 h-14 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-xl font-bold text-gray-900">Processing Resume...</p>
                                </div>
                            ) : resume ? (
                                <div className="space-y-3">
                                    <div className="w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <p className="text-xl font-bold text-gray-900">{resume.name}</p>
                                    <p className="text-base text-gray-600 font-medium">Ready for analysis</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-gray-500 group-hover:text-gray-800">
                                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    <p className="text-xl font-semibold">Click or Drag PDF/DOCX/TXT here</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION 4: INTERVIEW BASICS */}
                <div className="space-y-10 animate-fadeIn delay-300">
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-gray-900 uppercase tracking-widest">3. Interview Basics</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="block text-base font-bold text-gray-700 text-center mb-2">Interview Style</label>
                            <div className="flex flex-wrap justify-center gap-3">
                                {["HR", "Technical", "Not Sure"].map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setType(t)}
                                        className={`px-5 py-3 rounded-xl text-sm font-bold transition-all ${type === t
                                            ? "bg-black text-white shadow-lg scale-105"
                                            : "bg-white text-gray-600 border border-gray-300 hover:border-black hover:text-black"
                                            }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-base font-bold text-gray-700 text-center mb-2">Difficulty</label>
                            <div className="flex flex-wrap justify-center gap-3">
                                {["Easy", "Medium", "Hard"].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDifficulty(d)}
                                        className={`px-5 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d
                                            ? "bg-black text-white shadow-lg scale-105"
                                            : "bg-white text-gray-600 border border-gray-300 hover:border-black hover:text-black"
                                            }`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-base font-bold text-gray-700 text-center mb-2">Duration</label>
                            <div className="flex flex-wrap justify-center gap-3">
                                {[15, 20].map((min) => (
                                    <button
                                        key={min}
                                        onClick={() => handleDurationSelect(min)}
                                        className={`px-5 py-3 rounded-xl text-sm font-bold transition-all ${!isCustomDuration && duration === min
                                            ? "bg-black text-white shadow-lg scale-105"
                                            : "bg-white text-gray-600 border border-gray-300 hover:border-black hover:text-black"
                                            }`}
                                    >
                                        {min}m
                                    </button>
                                ))}
                                <button
                                    onClick={() => handleDurationSelect('custom')}
                                    className={`px-5 py-3 rounded-xl text-sm font-bold transition-all ${isCustomDuration
                                        ? "bg-black text-white shadow-lg scale-105"
                                        : "bg-white text-gray-600 border border-gray-300 hover:border-black hover:text-black"
                                        }`}
                                >
                                    Custom
                                </button>
                            </div>
                            {isCustomDuration && (
                                <div className="max-w-[120px] mx-auto mt-3">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            max="120"
                                            value={duration || ''}
                                            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                                            className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-center font-bold text-lg focus:outline-none"
                                            placeholder="Min"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400"></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION 5: GUIDANCE */}
                <div className="bg-gray-100 rounded-3xl p-8 md:p-12 space-y-8 animate-fadeIn delay-400">
                    <h3 className="text-gray-900 font-extrabold text-xl text-center tracking-tight">Keep in mind</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-12 text-base text-gray-700 max-w-4xl mx-auto">
                        <ul className="space-y-4">
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Speak clearly and maintain a steady pace.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Maintain calm eye contact with the camera.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Structure your thoughts before speaking.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Treat this like a real conversation.</span>
                            </li>
                        </ul>
                        <ul className="space-y-4">
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>There are no &quot;do-overs&quot; or pauses.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Avoid reading from external scripts.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Stay focused on the question asked.</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>Be yourself and stay confident.</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* SECTION 6: COMMITMENT & START */}
                <div className="space-y-8 pb-24 animate-fadeIn delay-500">
                    <div className="flex justify-center">
                        <label className="flex items-center space-x-4 cursor-pointer group p-4 rounded-xl hover:bg-gray-100 transition-colors">
                            <div className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all ${isAgreed ? 'bg-black border-black' : 'border-gray-400 bg-white group-hover:border-black'}`}>
                                {isAgreed && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={isAgreed}
                                onChange={(e) => setIsAgreed(e.target.checked)}
                            />
                            <span className="text-lg font-bold text-gray-700 group-hover:text-black transition-colors">
                                I confirm I will not use AI assistance or external notes.
                            </span>
                        </label>
                    </div>

                    <div className="text-center space-y-4">
                        <button
                            onClick={() => resume && type && difficulty && duration && onStart({ userName, resumeFile: resume, resumeText, jobDescription, type, difficulty, duration })}
                            disabled={!isReady}
                            className="w-full max-w-md py-6 bg-black text-white rounded-2xl font-bold text-xl hover:bg-gray-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-2xl hover:-translate-y-1 active:scale-[0.99]"
                        >
                            Enter Interview Room
                        </button>

                        {!isReady && (
                            <p className="text-sm text-gray-500 font-medium animate-pulse">
                                Please complete all steps above (Role, Resume, Type, Duration & Agreement)
                            </p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
