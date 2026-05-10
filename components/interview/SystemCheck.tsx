"use client";

import React, { useState, useEffect, useRef } from "react";
import { InterviewConfig } from "./SetupGate";
import { Camera, Mic, Wifi, CheckCircle2, AlertCircle, Volume2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface SystemCheckProps {
    config: InterviewConfig;
    onComplete: () => void;
}

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

                // Setup Audio Analyser for minimal visualizer
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
                    
                    // Calculate average volume
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const avg = sum / dataArray.length;
                    // Normalize to 0-100
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

    const isReady = hasCamera && hasMic && isNetworkStable;

    const handleSpeakerTest = () => {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        
        setTimeout(() => ctx.close(), 600);
    };

    const StatusItem = ({ active, label, icon: Icon, delay }: { active: boolean, label: string, icon: any, delay: number }) => (
        <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay }}
            className={`flex items-center space-x-4 p-4 rounded-xl border border-white/5 backdrop-blur-md transition-all duration-500 ${active ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-black/20 opacity-50'}`}
        >
            <div className={`p-2 rounded-full transition-colors duration-500 ${active ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                {active ? <CheckCircle2 size={20} /> : <Icon size={20} />}
            </div>
            <span className={`font-medium transition-colors duration-500 ${active ? 'text-gray-100' : 'text-gray-500'}`}>
                {label}
            </span>
        </motion.div>
    );

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-[#0a0a0c] to-black text-gray-100 py-12 px-6 flex flex-col items-center overflow-y-auto">
            
            {/* Header */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12"
            >
                <h1 className="text-3xl md:text-4xl font-light tracking-wide text-white mb-3">
                    Prepare Your Environment
                </h1>
                <p className="text-gray-400 font-medium">
                    Please ensure your system is ready before entering the interview.
                </p>
            </motion.div>

            <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
                
                {/* LEFT COLUMN: Camera & Audio */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.6 }}
                    className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-6"
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
                                className={`w-full h-full object-cover transition-opacity duration-1000 ${hasCamera ? 'opacity-100' : 'opacity-0'}`}
                            />
                        )}
                        
                        {!hasCamera && !permissionError && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
                            </div>
                        )}

                        {/* Name overlay */}
                        {hasCamera && (
                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10">
                                <span className="text-sm font-medium text-white">{config.userName}</span>
                            </div>
                        )}
                    </div>

                    {/* Microphone Visualizer & Speaker Test */}
                    <div className="flex items-center justify-between bg-white/5 border border-white/5 backdrop-blur-xl p-4 rounded-2xl">
                        <div className="flex items-center space-x-4">
                            <div className={`p-3 rounded-full ${hasMic ? (audioLevel > 5 ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400') : 'bg-gray-800 text-gray-600'}`}>
                                <Mic size={20} />
                            </div>
                            <div className="flex items-center space-x-1 h-8 w-32">
                                {/* Minimal waveform */}
                                {[...Array(12)].map((_, i) => (
                                    <div 
                                        key={i} 
                                        className="w-1.5 bg-gray-400 rounded-full transition-all duration-75"
                                        style={{ 
                                            height: hasMic ? `${Math.max(4, (audioLevel / 100) * 32 * (Math.random() * 0.5 + 0.5))}px` : '4px',
                                            opacity: hasMic ? (audioLevel > 5 ? 1 : 0.4) : 0.2
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={handleSpeakerTest}
                            className="flex items-center space-x-2 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors border border-white/5"
                        >
                            <Volume2 size={16} />
                            <span>Test Speaker</span>
                        </button>
                    </div>
                </motion.div>

                {/* RIGHT COLUMN: Summary & Checklist */}
                <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-8">
                    
                    {/* Summary Panel */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6"
                    >
                        <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-4">Session Details</h3>
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-400">Role</p>
                                <p className="text-lg font-medium text-white truncate">{config.jobDescription.split('\n')[0].substring(0, 40) || "Interview"}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <p className="text-sm text-gray-400">Type</p>
                                    <p className="font-medium text-white">{config.type}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">Duration</p>
                                    <p className="font-medium text-white">~{config.duration} mins</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Readiness Checklist */}
                    <div className="space-y-3">
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
                    </div>

                    {/* Tips */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-xs text-gray-500 space-y-2 px-2"
                    >
                        <p>• Find a quiet environment.</p>
                        <p>• Ensure strong lighting on your face.</p>
                        <p>• The interview will begin immediately upon entry.</p>
                    </motion.div>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="pt-4"
                    >
                        <button
                            onClick={() => {
                                // Stop tracks when leaving the system check
                                if (stream) {
                                    stream.getTracks().forEach(t => t.stop());
                                }
                                if (audioContext) {
                                    audioContext.close();
                                }
                                onComplete();
                            }}
                            disabled={!isReady}
                            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                                isReady 
                                ? 'bg-white text-black hover:bg-gray-200 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]' 
                                : 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
                            }`}
                        >
                            <span>Enter Interview Room</span>
                            {isReady && <ArrowRight size={20} />}
                        </button>
                    </motion.div>

                </div>

            </div>
        </div>
    );
}
