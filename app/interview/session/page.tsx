"use client";

import React, { useState } from "react";
import { SetupGate, InterviewConfig } from "@/components/interview/SetupGate";
import { ActiveSession } from "@/components/interview/ActiveSession";

import { SystemCheck } from "@/components/interview/SystemCheck";
import { InterviewCountdown } from "@/components/interview/InterviewCountdown";
import { AlertCircle, Loader2 } from "lucide-react";

type InterviewPhase = "setup" | "system_check" | "initializing" | "countdown" | "interview";

const MAX_RESUME_TEXT_CHARS = 8000;
const MAX_JOB_DESCRIPTION_CHARS = 3000;

const safePayloadText = (text: string, maxChars: number) =>
    (text || "").replace(/\s+/g, " ").trim().slice(0, maxChars);

export default function InterviewSessionPage() {
    const [phase, setPhase] = useState<InterviewPhase>("setup");
    const [config, setConfig] = useState<InterviewConfig | null>(null);
    
    // Initialized Backend State
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [initialQuestion, setInitialQuestion] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);

    const handleSetupComplete = (config: InterviewConfig) => {
        setConfig(config);
        setPhase("system_check");
    };

    const handleSystemCheckComplete = async () => {
        if (!config) return;
        setPhase("initializing");
        setInitError(null);

        try {
            const response = await fetch("/api/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resume_text: safePayloadText(config.resumeText, MAX_RESUME_TEXT_CHARS),
                    job_description: safePayloadText(config.jobDescription, MAX_JOB_DESCRIPTION_CHARS),
                    interview_type: config.type,
                    difficulty: config.difficulty,
                    total_duration: config.duration,
                    user_name: config.userName
                })
            });

            if (!response.ok) {
                let errText = "Unknown error";
                try { errText = await response.text(); } catch { }
                throw new Error(`Session initialization failed. HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            setSessionId(data.session_id);
            setInitialQuestion(data.question);
            
            // Move to countdown
            setPhase("countdown");

        } catch (err: any) {
            console.error("Start Error:", err);
            setInitError(err.message || "Failed to initialize interview session.");
        }
    };

    const handleCountdownComplete = () => {
        setPhase("interview");
    };

    if (phase === "interview" && config && sessionId && initialQuestion) {
        return <ActiveSession config={config} initialSessionId={sessionId} initialQuestion={initialQuestion} />;
    }

    if (phase === "countdown") {
        return <InterviewCountdown onComplete={handleCountdownComplete} />;
    }

    if (phase === "initializing") {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
                {initError ? (
                    <div className="text-center space-y-4 max-w-md">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                        <h2 className="text-xl font-bold text-red-400">Connection Failed</h2>
                        <p className="text-gray-400">{initError}</p>
                        <button 
                            onClick={() => setPhase("system_check")}
                            className="px-6 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                ) : (
                    <div className="text-center space-y-6">
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                            <Loader2 className="w-12 h-12 text-blue-400 animate-spin relative z-10 mx-auto" />
                        </div>
                        <h2 className="text-xl font-light tracking-wide text-gray-200">
                            Initializing Secure Interview Environment...
                        </h2>
                        <p className="text-sm text-gray-500 animate-pulse">
                            Generating adaptive roadmap and calibrating evaluator
                        </p>
                    </div>
                )}
            </div>
        );
    }

    if (phase === "system_check" && config) {
        return <SystemCheck config={config} onComplete={handleSystemCheckComplete} />;
    }

    return <SetupGate onStart={handleSetupComplete} />;
}
