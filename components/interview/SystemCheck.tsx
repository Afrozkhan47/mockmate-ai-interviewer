"use client";

import React, { useState, useEffect, useRef } from "react";
import { InterviewConfig } from "./SetupGate";
import { Camera, Mic, Wifi, CheckCircle2, AlertCircle, Volume2, ArrowRight, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SystemCheckProps {
    config: InterviewConfig;
    onComplete: () => void;
}

const StatusItem = ({ active, label, icon: Icon, delay }: { active: boolean, label: string, icon: any, delay: number }) => (
    <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay }}
        className={`flex items-center space-x-3 md:space-x-4 p-4 rounded-xl border border-white/5 backdrop-blur-md transition-all duration-500 ${active ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-black/20 opacity-50'}`}
    >
        <div className={`p-2 rounded-full transition-colors duration-500 ${active ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
            {active ? <CheckCircle2 size={20} /> : <Icon size={20} />}
        </div>
        <span className={`font-medium text-sm md:text-base transition-colors duration-500 ${active ? 'text-gray-100' : 'text-gray-500'}`}>
            {label}
        </span>
    </motion.div>
);

export function SystemCheck({ config, onComplete }: SystemCheckProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [audioLevel, setAudioLevel] = useState<number>(0);

    const [hasCamera, setHasCamera] = useState<boolean>(false);
    const [hasMic, setHasMic] = useState<boolean>(false);
    const [isNetworkStable, setIsNetworkStable] = useState<boolean>(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState<boolean>(true);
    const [permissionError, setPermissionError] = useState<string | null>(null);

    // Speaker Verification States
    const [speakerTested, setSpeakerTested] = useState<boolean>(false);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [speakerVerified, setSpeakerVerified] = useState<boolean>(false);

    // Simulated Network Check
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsNetworkStable(true);
            setIsCheckingNetwork(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    // Request Media Permissions
    useEffect(() => {
        let mounted = true;
        let animationFrameId: number;

        const requestMedia = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });
                
                if (!mounted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }

                setStream(mediaStream);
                setHasCamera(true);
                setHasMic(true);

                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }

                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const analyserNode = audioCtx.createAnalyser();
                analyserNode.fftSize = 256;
                
                const source = audioCtx.createMediaStreamSource(mediaStream);
                source.connect(analyserNode);

                setAudioContext(audioCtx);
                setAnalyser(analyserNode);

                const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

                const updateAudioLevel = () => {
                    if (!mounted) return;
                    analyserNode.getByteFrequencyData(dataArray);
                    
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const avg = sum / dataArray.length;
                    const level = Math.min(100, Math.round((avg / 255) * 100));
                    setAudioLevel(level);
                    
                    animationFrameId = requestAnimationFrame(updateAudioLevel);
                };

                updateAudioLevel();

            } catch (err: any) {
                console.error("Media permission error:", err);
                if (mounted) {
                    setPermissionError("Camera and Microphone access is required. Please check your browser settings.");
                }
            }
        };

        requestMedia();

        return () => {
            mounted = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (audioContext) audioContext.close();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const isReady = hasCamera && hasMic && isNetworkStable && speakerVerified;

    const handleSpeakerTest = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel(); // Stop any pending speech
            const utterance = new SpeechSynthesisUtterance("Hello, this is a speaker test for your interview.");
            
            // Try to find a premium voice
            const voices = window.speechSynthesis.getVoices();
            const premiumVoice = voices.find(v => 
                v.name.toLowerCase().includes('siri') || 
                v.name.toLowerCase().includes('samantha') ||
                v.name.toLowerCase().includes('karen')
            ) || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
            
            if (premiumVoice) {
                utterance.voice = premiumVoice;
            }
            
            utterance.rate = 0.95;
            utterance.pitch = 1;

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => {
                setIsSpeaking(false);
                setSpeakerTested(true);
            };
            utterance.onerror = () => {
                setIsSpeaking(false);
                setSpeakerTested(true);
            };

            window.speechSynthesis.speak(utterance);
        } else {
            // Fallback if not supported
            setSpeakerTested(true);
        }
    };

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-[#0a0a0c] to-black text-gray-100 py-8 px-4 md:px-8 flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden">
            
            <div className="w-full flex flex-col items-center max-w-7xl my-auto">
                {/* Header */}
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-6 md:mb-10 shrink-0"
                >
                    <h1 className="text-2xl md:text-4xl font-light tracking-wide text-white mb-2 md:mb-3">
                        Prepare Your Environment
                    </h1>
                    <p className="text-sm md:text-base text-gray-400 font-medium">
                        Please ensure your system is ready before entering the interview.
                    </p>
                </motion.div>

                <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 items-start">
                    
                    {/* LEFT COLUMN: Camera & Audio */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1, duration: 0.6 }}
                        className="lg:col-span-7 flex flex-col space-y-4 md:space-y-6"
                    >
                        {/* Camera Feed */}
                        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                            {permissionError ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 p-8 text-center">
                                    <AlertCircle size={48} className="text-red-400 mb-4" />
                                    <p className="text-xl text-gray-200">{permissionError}</p>
                                </div>
                            ) : (
                                <video 
                                    ref={videoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-1000 ${hasCamera ? 'opacity-100' : 'opacity-0'}`}
                                />
                            )}
                            
                            {!hasCamera && !permissionError && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-12 h-12 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
                                </div>
                            )}

                            {hasCamera && (
                                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-white/10">
                                    <span className="text-xs md:text-sm font-medium text-white">{config.userName}</span>
                                </div>
                            )}
                        </div>

                        {/* Microphone Visualizer & Interactive Speaker Test */}
                        <div className="flex flex-col bg-white/5 border border-white/5 backdrop-blur-xl p-4 md:p-5 rounded-2xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 md:space-x-4">
                                    <div className={`p-2.5 md:p-3 rounded-full transition-all duration-300 ${hasMic ? (audioLevel > 5 ? 'bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-gray-800 text-gray-400') : 'bg-gray-800 text-gray-600'}`}>
                                        <Mic size={18} className="md:w-5 md:h-5" />
                                    </div>
                                    <div className="flex items-center space-x-1 h-6 md:h-8 w-24 md:w-32">
                                        {[...Array(12)].map((_, i) => (
                                            <div 
                                                key={i} 
                                                className="w-1 md:w-1.5 bg-gray-400 rounded-full transition-all duration-75"
                                                style={{ 
                                                    height: hasMic ? `${Math.max(4, (audioLevel / 100) * 32 * (Math.random() * 0.5 + 0.5))}px` : '4px',
                                                    opacity: hasMic ? (audioLevel > 5 ? 1 : 0.4) : 0.2
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Initial Speaker Test Button */}
                                {!speakerTested && !isSpeaking && !speakerVerified && (
                                    <button 
                                        onClick={handleSpeakerTest}
                                        className="flex items-center space-x-2 text-xs md:text-sm font-medium text-white bg-blue-600/80 hover:bg-blue-500 px-4 py-2 md:px-5 md:py-2.5 rounded-xl transition-all border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                                    >
                                        <Volume2 size={16} className="md:w-[18px] md:h-[18px]" />
                                        <span>Test Speaker</span>
                                    </button>
                                )}
                                
                                {/* Speaking State */}
                                {isSpeaking && (
                                    <div className="flex items-center space-x-2 text-xs md:text-sm font-medium text-blue-400 px-3 py-1.5 md:px-4 md:py-2">
                                        <Volume2 size={16} className="animate-pulse md:w-[18px] md:h-[18px]" />
                                        <span>Playing test audio...</span>
                                    </div>
                                )}
                            </div>

                            {/* Speaker Verification Flow */}
                            <AnimatePresence>
                                {speakerTested && !speakerVerified && !isSpeaking && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                        className="pt-3 md:pt-4 border-t border-white/10 flex items-center justify-between overflow-hidden"
                                    >
                                        <span className="text-xs md:text-sm font-medium text-gray-300">Could you hear the audio clearly?</span>
                                        <div className="flex items-center space-x-2 md:space-x-3">
                                            <button 
                                                onClick={handleSpeakerTest}
                                                className="text-[11px] md:text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-white/10 transition-all"
                                            >
                                                Replay
                                            </button>
                                            <button 
                                                onClick={() => setSpeakerVerified(true)}
                                                className="text-[11px] md:text-xs font-bold text-white bg-green-600/80 hover:bg-green-500 px-4 py-1.5 md:px-6 md:py-2 rounded-lg border border-green-500/50 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                                            >
                                                Yes
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {speakerVerified && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                        className="pt-3 md:pt-4 border-t border-white/5 flex items-center justify-center text-xs md:text-sm font-medium text-green-400 overflow-hidden"
                                    >
                                        <CheckCircle2 size={16} className="mr-2 md:w-[18px] md:h-[18px]" />
                                        Speaker Verified Successfully
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* RIGHT COLUMN: Summary & Checklist */}
                    <div className="lg:col-span-5 flex flex-col space-y-5 md:space-y-6 lg:space-y-8">
                        
                        {/* Summary Panel (Compact Horizontal Layout) */}
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4 md:p-5"
                        >
                            <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3 md:mb-4">Session Details</h3>
                            <div className="flex flex-col space-y-3 md:space-y-4">
                                <div className="flex flex-col">
                                    <p className="text-xs text-gray-400 mb-0.5">Role</p>
                                    <p className="text-sm md:text-base font-medium text-white truncate">{config.jobDescription.split('\n')[0].substring(0, 40) || "Interview"}</p>
                                </div>
                                <div className="flex items-center space-x-6">
                                    <div className="flex flex-col">
                                        <p className="text-xs text-gray-400 mb-0.5">Type</p>
                                        <p className="text-sm font-medium text-white">{config.type}</p>
                                    </div>
                                    <div className="w-px h-6 bg-white/10" />
                                    <div className="flex flex-col">
                                        <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                                        <p className="text-sm font-medium text-white">~{config.duration} mins</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Readiness Checklist */}
                        <div className="space-y-2.5 md:space-y-3 lg:space-y-4">
                            <StatusItem 
                                active={!isCheckingNetwork && isNetworkStable} 
                                label="Stable Connection" 
                                icon={Wifi} 
                                delay={0.3} 
                            />
                            <StatusItem 
                                active={hasCamera} 
                                label="Camera Connected" 
                                icon={Camera} 
                                delay={0.4} 
                            />
                            <StatusItem 
                                active={hasMic} 
                                label="Microphone Active" 
                                icon={Mic} 
                                delay={0.5} 
                            />
                            <StatusItem 
                                active={speakerVerified} 
                                label="Speaker Verified" 
                                icon={Volume2} 
                                delay={0.6} 
                            />
                        </div>

                        {/* Tips */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            className="text-xs md:text-sm text-gray-400 space-y-2 md:space-y-3 px-1 md:px-2 font-medium"
                        >
                            <p className="flex items-center"><span className="text-blue-500 mr-2">•</span> Find a quiet environment.</p>
                            <p className="flex items-center"><span className="text-blue-500 mr-2">•</span> Ensure strong lighting on your face.</p>
                            <p className="flex items-center"><span className="text-blue-500 mr-2">•</span> The interview will begin immediately upon entry.</p>
                        </motion.div>

                        {/* CTA */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                            className="pt-1 md:pt-2"
                        >
                            <button
                                onClick={() => {
                                    if (stream) {
                                        stream.getTracks().forEach(t => t.stop());
                                    }
                                    if (audioContext) {
                                        audioContext.close();
                                    }
                                    onComplete();
                                }}
                                disabled={!isReady}
                                className={`w-full flex items-center justify-center space-x-2 md:space-x-3 py-4 md:py-5 rounded-xl font-bold text-base md:text-lg transition-all duration-500 ${
                                    isReady 
                                    ? 'bg-white text-black hover:bg-gray-200 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.25)] scale-100' 
                                    : 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5 scale-[0.98]'
                                }`}
                            >
                                <span>Enter Interview Room</span>
                                {isReady && <ArrowRight size={20} className="md:w-[22px] md:h-[22px]" />}
                            </button>
                        </motion.div>

                    </div>

                </div>
            </div>
        </div>
    );
}
