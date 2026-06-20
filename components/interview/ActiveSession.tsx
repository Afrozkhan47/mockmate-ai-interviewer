"use client";

import React, { useEffect, useState, useRef } from "react";
import { InterviewConfig } from "./SetupGate";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2 } from "lucide-react";
import { speechManager } from "@/services/speechManager";
import { sttManager } from "@/services/sttManager";

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
    const [isSummaryReady, setIsSummaryReady] = useState(false);
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

    // Dictation State
    const [isDictating, setIsDictating] = useState(false);
    const [interimText, setInterimText] = useState("");

    // Media State
    const videoRef = useRef<HTMLVideoElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const isFinalizingRef = useRef(false);
    const isInitialMount = useRef(true);

    // Clean up STT on unmount
    useEffect(() => {
        return () => {
            sttManager.stopListening();
        };
    }, []);

    const toggleDictation = () => {
        if (isDictating) {
            sttManager.stopListening();
        } else {
            sttManager.startListening(
                (interim, final) => {
                    setInterimText(interim);
                    if (final) {
                        setAnswer(prev => (prev + " " + final).trim());
                    }
                },
                (listening) => {
                    setIsDictating(listening);
                    if (!listening) setInterimText("");
                },
                (err) => {
                    console.error("STT Error:", err);
                    setIsDictating(false);
                    setInterimText("");
                }
            );
        }
    };

    // Auto-scroll input when dictating
    useEffect(() => {
        if (isDictating && inputRef.current) {
            inputRef.current.scrollLeft = inputRef.current.scrollWidth;
        }
    }, [interimText, answer, isDictating]);

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

    // Toggle Mic Track
    useEffect(() => {
        if (stream) {
            stream.getAudioTracks().forEach(track => {
                track.enabled = micEnabled;
            });
        }
    }, [micEnabled, stream]);

    // Toggle Camera Track
    useEffect(() => {
        let mounted = true;

        const toggleCamera = async () => {
            if (isInitialMount.current) {
                isInitialMount.current = false;
                return; // Skip turning off/on during the very first render cycle
            }

            if (!cameraEnabled) {
                // Turn OFF: completely stop and remove video tracks to release hardware
                if (stream) {
                    stream.getVideoTracks().forEach(track => {
                        track.stop();
                        stream.removeTrack(track);
                    });
                    if (videoRef.current) {
                        videoRef.current.srcObject = null; // Clear to prevent frozen frame
                    }
                }
            } else {
                // Turn ON: request a fresh video stream
                try {
                    const newVideoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    if (!mounted) {
                        newVideoStream.getTracks().forEach(t => t.stop());
                        return;
                    }
                    
                    if (stream) {
                        // Append the new track to the existing stream
                        const newVideoTrack = newVideoStream.getVideoTracks()[0];
                        stream.addTrack(newVideoTrack);
                        
                        if (videoRef.current) {
                            // Rebind the entire stream
                            videoRef.current.srcObject = stream;
                            // Attempt to play if it was paused
                            await videoRef.current.play().catch(e => console.error("Playback failed:", e));
                        }
                    }
                } catch (err) {
                    console.error("Failed to re-enable camera", err);
                    if (mounted) setCameraEnabled(false);
                }
            }
        };

        toggleCamera();
        
        return () => {
            mounted = false;
        };
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
        
        // Start thinking state immediately to mask latency
        setIsThinking(true); 
        const fetchStartTime = Date.now();

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
                // Play final emotional closure
                const closingPhrase = "That concludes our interview today. Thank you for taking the time to speak with me.";
                setIsThinking(false);
                setCurrentQuestion(closingPhrase);
                setIsSpeaking(true);
                
                await speechManager.playSpeech(
                    closingPhrase,
                    () => {},
                    () => {
                        setIsSpeaking(false);
                        setTransitionStatus('idle');
                        handleComplete(false);
                    },
                    (err) => {
                        console.error("Speech Manager Error:", err);
                        setIsSpeaking(false);
                        setTransitionStatus('idle');
                        handleComplete(false);
                    }
                );
            } else {
                // Calculate required dynamic delay (based on answer length)
                const fetchDuration = Date.now() - fetchStartTime;
                // ~500ms for short answers, ~900ms for medium, ~1800ms for deep answers
                // Multiplying string length by 4 gives a reasonable spread (e.g. 100 chars -> 400ms)
                const idealDelay = Math.max(500, Math.min(1800, answerText.length * 4));
                const remainingDelay = idealDelay - fetchDuration;
                
                if (remainingDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingDelay));
                }
                
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
            setIsThinking(false);
        } finally {
            setIsFetching(false);
            setAnswer(""); // Clear the input field after sending
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

    const handleComplete = async (manualExit = false) => {
        if (isFinalizingRef.current) return;
        isFinalizingRef.current = true;
        setIsCompleted(true);
        
        speechManager.stop();
        sttManager.stopListening();
        
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        if (manualExit && sessionId) {
            try {
                await fetch(`/api/interviews/${sessionId}/end`, { method: "POST" });
            } catch (e) {
                console.error("Failed to finalize session:", e);
            }
            router.push(`/dashboard?session_id=${sessionId}`);
            return;
        }

        // Wait for summary (fake latency mask for backend process)
        setTimeout(() => {
            setIsSummaryReady(true);
            
            // Auto redirect fallback after 10 seconds
            setTimeout(() => {
                if (sessionId) router.push(`/dashboard?session_id=${sessionId}`);
                else router.push('/dashboard');
            }, 10000);
        }, 4000);
    };

    if (isCompleted) {
        return (
            <div className="fixed inset-0 min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
                {/* Ambient Background Glow */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(59,38,103,0.15)_0%,rgba(0,0,0,0)_60%)]" />
                
                <AnimatePresence mode="wait">
                    {!isSummaryReady ? (
                        <motion.div 
                            key="generating"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.5 }}
                            className="relative z-10 text-center space-y-8"
                        >
                            <div className="flex space-x-3 justify-center mb-6">
                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 rounded-full bg-violet-500" />
                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-3 h-3 rounded-full bg-violet-400" />
                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-3 h-3 rounded-full bg-violet-300" />
                            </div>
                            <h2 className="text-3xl font-light tracking-wide text-white">Generating Interview Summary</h2>
                            <p className="text-zinc-400 text-lg leading-relaxed font-medium">
                                Compiling your performance and analyzing feedback...
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="ready"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 max-w-2xl w-full p-12 rounded-[24px] shadow-2xl text-center space-y-8 relative z-10"
                        >
                            <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-400 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="space-y-4">
                                <h2 className="text-4xl font-light tracking-wide text-white">Summary Ready</h2>
                                <p className="text-zinc-400 text-lg leading-relaxed font-medium max-w-lg mx-auto">
                                    Your interview has concluded successfully. You can now review your detailed feedback.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 pt-6">
                                <button
                                    onClick={() => router.push(`/dashboard?session_id=${sessionId}`)}
                                    className="w-full sm:w-auto px-8 py-3.5 bg-white text-black hover:bg-zinc-200 rounded-xl font-semibold tracking-wide transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                                >
                                    View Dashboard
                                </button>
                                <button
                                    onClick={() => router.push('/')}
                                    className="w-full sm:w-auto px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium tracking-wide transition-all border border-white/10"
                                >
                                    Return Home
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                        <span className="text-sm font-medium text-white max-w-[140px] lg:max-w-[250px] truncate block" title={config.jobDescription.split('\n')[0]}>
                            {config.jobDescription.split('\n')[0] || "Interview"}
                        </span>
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
                <div className="w-full flex-1 max-h-[50vh] grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
                    
                    {/* LEFT PANEL: INTERVIEWER (Balanced Primary) */}
                    <div className="lg:col-span-7 relative rounded-3xl overflow-hidden bg-black/40 border border-white/5 shadow-2xl flex items-center justify-center">
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

                    {/* RIGHT PANEL: CANDIDATE (Balanced Secondary) */}
                    <div className="lg:col-span-5 relative rounded-3xl overflow-hidden bg-black/60 border border-white/5 shadow-2xl flex items-center justify-center">
                        {cameraEnabled ? (
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full h-full object-cover transform -scale-x-100 absolute inset-0"
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
                <div className="flex-1 flex flex-col justify-center items-center mt-8 px-4 max-w-3xl mx-auto w-full">
                    <motion.p 
                        key={displayedQuestion} // Forces re-render animation if needed, but typing effect handles it
                        className={`text-lg md:text-2xl text-center leading-relaxed font-light tracking-wide text-white/95 drop-shadow-2xl transition-opacity duration-300 ${isSessionError ? 'text-red-400' : ''}`}
                        style={{ textShadow: "0 4px 20px rgba(0,0,0,0.9)" }}
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
                    <div className="flex-1 relative flex items-center bg-white/5 border border-white/10 rounded-xl focus-within:ring-1 focus-within:ring-violet-500/50 hover:bg-white/10 transition-all duration-300">
                        <input
                            ref={inputRef}
                            type="text"
                            value={isDictating && interimText ? `${answer} ${interimText}` : answer}
                            onChange={(e) => {
                                if (!isDictating) setAnswer(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isTyping && !isFetching && !isThinking) {
                                    if (isDictating) sttManager.stopListening();
                                    handleNext();
                                }
                            }}
                            disabled={isTyping || isFetching || isThinking}
                            placeholder={
                                isTyping ? "Listen to the interviewer..." : 
                                isDictating ? "Listening..." : "Type or speak your response here and press Enter..."
                            }
                            className={`w-full bg-transparent px-5 py-3 text-white placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 ${isDictating ? 'text-violet-200' : ''}`}
                            autoFocus
                        />
                        {sttManager.isSupported() && (
                            <button
                                onClick={toggleDictation}
                                disabled={isTyping || isFetching || isThinking}
                                className={`absolute right-2 p-2 rounded-lg transition-all ${
                                    isDictating 
                                        ? 'bg-violet-500/20 text-violet-400 animate-pulse' 
                                        : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                } disabled:opacity-50`}
                            >
                                <Mic size={18} />
                            </button>
                        )}
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
