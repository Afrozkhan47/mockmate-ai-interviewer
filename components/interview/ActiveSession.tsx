"use client";

import React, { useEffect, useState, useRef } from "react";
import { InterviewConfig } from "./SetupGate";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2 } from "lucide-react";
import { speechManager } from "@/services/speechManager";

interface ActiveSessionProps {
    config: InterviewConfig;
    initialSessionId: string;
    initialQuestion: string;
}

export function ActiveSession({ config, initialSessionId, initialQuestion }: ActiveSessionProps) {
    const router = useRouter();
    const [timeLeft, setTimeLeft] = useState(config.duration * 60);
    const isLowTime = timeLeft <= 60;
    const [isCompleted, setIsCompleted] = useState(false);
    const [isSessionError, setIsSessionError] = useState(false);

    const [sessionId, setSessionId] = useState<string>(initialSessionId);
    const [interviewState, setInterviewState] = useState<string>("WARM_UP");

    const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);
    const [displayedQuestion, setDisplayedQuestion] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [transitionStatus, setTransitionStatus] = useState<'idle' | 'submitting' | 'fetching'>('idle');

    const [answer, setAnswer] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Media State
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const isFinalizingRef = useRef(false);

    // Initialize Webcam
    useEffect(() => {
        let mounted = true;
        const initCamera = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (!mounted) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                }
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                console.error("Camera access denied or unavailable", err);
            }
        };
        initCamera();

        return () => {
            mounted = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Toggle Camera Track
    useEffect(() => {
        if (stream) {
            stream.getVideoTracks().forEach(track => {
                track.enabled = cameraEnabled;
            });
        }
    }, [cameraEnabled, stream]);

    // Fullscreen handling
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const submitAnswer = async (answerText: string) => {
        if (!sessionId || isFinalizingRef.current) return;
        setIsFetching(true);
        setTransitionStatus('submitting');
        setIsSessionError(false);
        try {
            const response = await fetch("/api/answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId, answer: answerText })
            });

            if (!response.ok) {
                if (response.status === 404 || response.status === 400) {
                    if (!isFinalizingRef.current && sessionId) handleComplete(true);
                    return;
                }
                throw new Error("Session fetch failed");
            }

            const data = await response.json();
            setInterviewState(data.state);

            if (data.is_final) {
                handleComplete(false);
            } else {
                // MASK LATENCY: TTS generation delay is hidden by the Thinking state
                setIsThinking(true);
                
                await speechManager.playSpeech(
                    data.question,
                    // onStart
                    () => {
                        setIsThinking(false);
                        setCurrentQuestion(data.question);
                        setIsSpeaking(true);
                    },
                    // onComplete
                    () => {
                        setIsSpeaking(false);
                        setTransitionStatus('idle');
                    },
                    // onError
                    (err) => {
                        console.error("Speech Manager Error:", err);
                        setIsSpeaking(false);
                        setTransitionStatus('idle');
                    }
                );
            }
        } catch (err) {
            console.error("Submit Error:", err);
            if (!isFinalizingRef.current) {
                setIsSessionError(true);
                setDisplayedQuestion("The interview session was interrupted. Please restart the interview.");
                setTransitionStatus('idle');
            }
        } finally {
            setIsFetching(false);
        }
    };

    // Initial Question Audio Playback on Mount
    useEffect(() => {
        let mounted = true;

        const playInitial = async () => {
            setIsThinking(true); // Mask initial setup latency
            await speechManager.playSpeech(
                initialQuestion,
                () => {
                    if (!mounted) return;
                    setIsThinking(false);
                    setCurrentQuestion(initialQuestion);
                    setIsSpeaking(true);
                },
                () => {
                    if (!mounted) return;
                    setIsSpeaking(false);
                    setTransitionStatus('idle');
                },
                (err) => {
                    if (!mounted) return;
                    setIsSpeaking(false);
                    setTransitionStatus('idle');
                }
            );
        };

        // Delay slightly so UI can render fully before voice begins
        const timeout = setTimeout(() => {
            playInitial();
        }, 800);

        return () => {
            mounted = false;
            clearTimeout(timeout);
            speechManager.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Typing Effect Logic (Synchronized with Audio Start)
    useEffect(() => {
        if (!currentQuestion || isSessionError) return;

        const fullText = currentQuestion;
        setDisplayedQuestion("");
        setIsTyping(true);
        setAnswer("");

        let charIndex = 0;
        let typingTimeout: NodeJS.Timeout;

        const typeNextChar = () => {
            if (charIndex < fullText.length) {
                setDisplayedQuestion(fullText.slice(0, charIndex + 1));
                const char = fullText.charAt(charIndex);
                let delay = 25; 
                if (char === '.' || char === '?' || char === '!') delay = 350;
                else if (char === ',') delay = 150;
                charIndex++;
                typingTimeout = setTimeout(typeNextChar, delay);
            } else {
                setIsTyping(false);
            }
        };

        typingTimeout = setTimeout(typeNextChar, 100);
        return () => clearTimeout(typingTimeout);
    }, [currentQuestion, isSessionError]);

    // Timer Logic
    useEffect(() => {
        if (isCompleted || isSessionError) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    if (!isFinalizingRef.current && !isFetching) {
                        setTimeout(() => {
                            if (!isFinalizingRef.current) handleComplete(true);
                        }, 500);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isCompleted, isSessionError, isFetching]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const handleNext = async () => {
        if (!answer.trim() || isFetching || isTyping || isSessionError) return;
        await submitAnswer(answer);
    };

    const handleComplete = async (finalizeBackend = false) => {
        if (isFinalizingRef.current) return;
        isFinalizingRef.current = true;
        setIsCompleted(true);
        
        speechManager.stop();
        
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        if (finalizeBackend && sessionId) {
            try {
                if (isFetching) {
                    let waitCount = 0;
                    while (isFetching && waitCount < 30) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        waitCount++;
                    }
                }
                await fetch(`/api/interviews/${sessionId}/end`, { method: "POST" });
            } catch (e) {
                console.error("Failed to finalize session:", e);
            }
        }

        setTimeout(() => {
            if (sessionId) router.push(`/dashboard?session_id=${sessionId}`);
            else router.push('/dashboard');
        }, 3000);
    };

    if (isCompleted) {
        return (
            <div className="fixed inset-0 min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 max-w-2xl w-full p-12 rounded-[24px] shadow-2xl text-center space-y-8"
                >
                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto text-green-400 border border-green-500/30">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div className="space-y-4">
                        <h2 className="text-4xl font-light tracking-wide text-white">Interview Concluded</h2>
                        <p className="text-zinc-400 text-lg leading-relaxed font-medium">
                            Compiling your performance summary and analyzing feedback...
                        </p>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-zinc-950 text-gray-100 flex flex-col font-sans overflow-hidden selection:bg-violet-500/30">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(59,38,103,0.15)_0%,rgba(0,0,0,0)_60%)]" />

            {/* TOP BAR: Minimal */}
            <header className="h-16 shrink-0 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 z-30">
                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" />
                        <span className="font-medium text-sm tracking-widest uppercase text-zinc-300">REC</span>
                    </div>
                    <div className="hidden md:flex items-center space-x-4 border-l border-white/10 pl-6">
                        <span className="text-sm font-medium text-white">{config.jobDescription.split('\\n')[0].substring(0, 30) || "Interview"}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-sm text-zinc-400">{config.type}</span>
                    </div>
                </div>

                <div className="flex items-center space-x-6">
                    <div className={`font-mono text-lg tracking-wider ${isLowTime ? "text-red-400" : "text-white"}`}>
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col relative z-10 px-4 md:px-8 pt-6 pb-24">
                
                {/* SPLIT SCREEN VIDEO AREA */}
                <div className="w-full flex-1 max-h-[50vh] grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
                    
                    {/* LEFT PANEL: INTERVIEWER (Dominant) */}
                    <div className="lg:col-span-8 relative rounded-3xl overflow-hidden bg-black/40 border border-white/5 shadow-2xl flex items-center justify-center">
                        <AnimatePresence>
                            {isThinking && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
                                >
                                    <div className="flex space-x-2 mb-4">
                                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 rounded-full bg-violet-400" />
                                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 rounded-full bg-violet-400" />
                                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 rounded-full bg-violet-400" />
                                    </div>
                                    <span className="text-zinc-300 tracking-widest text-sm uppercase">Analyzing response</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Interviewer Avatar */}
                        <motion.div 
                            animate={{ scale: isSpeaking && !isThinking ? 1.05 : 1 }}
                            transition={{ duration: 2, repeat: isSpeaking ? Infinity : 0, repeatType: "reverse", ease: "easeInOut" }}
                            className="relative"
                        >
                            <div className={`w-40 h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-2 ${isSpeaking && !isThinking ? 'border-violet-500 shadow-[0_0_40px_rgba(139,92,246,0.3)]' : 'border-zinc-800'} transition-all duration-700`}>
                                <img src="/anz-khan-avatar.png" alt="Interviewer" className="w-full h-full object-cover opacity-90" />
                            </div>
                        </motion.div>

                        {/* Lower Third Info */}
                        <div className="absolute bottom-6 left-6 flex items-center space-x-3 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-white font-medium text-sm tracking-wide">Anz Khan</span>
                            <span className="text-zinc-500 text-xs uppercase px-2 border-l border-white/10">AI Interviewer</span>
                        </div>
                    </div>

                    {/* RIGHT PANEL: CANDIDATE */}
                    <div className="lg:col-span-4 relative rounded-3xl overflow-hidden bg-black/60 border border-white/5 shadow-2xl flex items-center justify-center">
                        {cameraEnabled ? (
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full h-full object-cover transform -scale-x-100"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center">
                                <span className="text-2xl font-light text-zinc-500">{config.userName.charAt(0)}</span>
                            </div>
                        )}

                        <div className="absolute bottom-4 left-4 flex items-center space-x-3 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                            {!micEnabled && <MicOff size={14} className="text-red-400" />}
                            <span className="text-white font-medium text-sm tracking-wide">{config.userName}</span>
                        </div>
                    </div>

                </div>

                {/* CINEMATIC QUESTION OVERLAY */}
                <div className="flex-1 flex flex-col justify-center items-center mt-8 px-4 max-w-5xl mx-auto w-full">
                    <motion.p 
                        key={displayedQuestion} // Forces re-render animation if needed, but typing effect handles it
                        className={`text-2xl md:text-4xl text-center leading-[1.4] font-light tracking-wide text-white drop-shadow-2xl transition-opacity duration-300 ${isSessionError ? 'text-red-400' : ''}`}
                        style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}
                    >
                        {displayedQuestion}
                    </motion.p>
                </div>
            </main>

            {/* FLOATING ZOOM-STYLE BOTTOM BAR */}
            <div className="absolute bottom-0 w-full p-6 flex justify-center pointer-events-none z-40">
                <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl flex items-center space-x-3 pointer-events-auto shadow-[0_20px_40px_rgba(0,0,0,0.5)] w-full max-w-4xl">
                    
                    {/* Media Controls */}
                    <div className="flex items-center space-x-2 px-2 border-r border-white/10 pr-4">
                        <button 
                            onClick={() => setMicEnabled(!micEnabled)}
                            className={`p-3 rounded-xl transition-all ${micEnabled ? 'hover:bg-white/10 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                        >
                            {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                        </button>
                        <button 
                            onClick={() => setCameraEnabled(!cameraEnabled)}
                            className={`p-3 rounded-xl transition-all ${cameraEnabled ? 'hover:bg-white/10 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                        >
                            {cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                        </button>
                    </div>

                    {/* Chat Input */}
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isTyping && !isFetching) {
                                    handleNext();
                                }
                            }}
                            disabled={isTyping || isFetching || isThinking}
                            placeholder={isTyping ? "Listen to the interviewer..." : "Type your response here and press Enter..."}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all disabled:opacity-50"
                            autoFocus
                        />
                    </div>

                    {/* Utility & Leave */}
                    <div className="flex items-center space-x-2 pl-2">
                        <button 
                            onClick={toggleFullscreen}
                            className="p-3 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-all hidden md:block"
                        >
                            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                        </button>
                        <button 
                            onClick={() => {
                                if(confirm("End the interview?")) handleComplete(true);
                            }}
                            className="flex items-center space-x-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-medium tracking-wide transition-all border border-red-500/20 ml-2"
                        >
                            <PhoneOff size={18} />
                            <span className="hidden sm:inline">End</span>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}
