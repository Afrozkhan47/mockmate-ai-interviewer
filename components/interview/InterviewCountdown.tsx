"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InterviewCountdownProps {
    onComplete: () => void;
}

export function InterviewCountdown({ onComplete }: InterviewCountdownProps) {
    const [count, setCount] = useState<number | "breath" | "starting">(3);

    useEffect(() => {
        const SEQUENCE: (number | "breath" | "starting")[] = [3, 2, 1, "breath", "starting"];
        let currentIndex = 0;
        
        // 1.25 seconds (1250ms) per step for a calm and confidence-building transition
        const interval = setInterval(() => {
            currentIndex++;
            if (currentIndex < SEQUENCE.length) {
                setCount(SEQUENCE[currentIndex]);
            } else {
                clearInterval(interval);
                // Extra buffer to let starting animation complete smoothly before transition
                setTimeout(() => onComplete(), 200);
            }
        }, 1250);

        return () => {
            clearInterval(interval);
        };
    }, [onComplete]);

    return (
        <div className="relative min-h-screen w-full bg-black overflow-hidden flex items-center justify-center">
            
            {/* Background Simulated Blurred UI */}
            <motion.div 
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                transition={{ duration: 4.5, ease: "easeOut" }}
                className="absolute inset-0 z-0 flex flex-col items-center justify-center opacity-40"
            >
                {/* Fake Video Box */}
                <div className="w-[300px] h-[400px] bg-gray-800 rounded-2xl absolute right-12 bottom-12 blur-2xl" />
                {/* Fake Text Box */}
                <div className="w-[800px] h-[300px] bg-gray-900 rounded-3xl absolute top-1/3 blur-3xl" />
                {/* Fake Mic Button */}
                <div className="w-[100px] h-[100px] bg-gray-700 rounded-full absolute bottom-12 blur-xl" />
            </motion.div>

            {/* Dark Vignette Overlay */}
            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />
            <div className="absolute inset-0 z-10 bg-black/40 pointer-events-none backdrop-blur-md" />

            {/* Countdown Text */}
            <div className="relative z-20 flex items-center justify-center h-full w-full">
                <AnimatePresence mode="wait">
                    {typeof count === "number" && (
                        <motion.div
                            key={count}
                            initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 1.2, filter: "blur(10px)" }}
                            transition={{ duration: 0.4, ease: "easeInOut" }}
                            className="text-white text-[15rem] font-light tracking-tighter"
                            style={{ textShadow: "0 0 40px rgba(255,255,255,0.3)" }}
                        >
                            {count}
                        </motion.div>
                    )}

                    {count === "breath" && (
                        <motion.div
                            key="breath"
                            initial={{ opacity: 0, y: 15, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -15, filter: "blur(8px)" }}
                            transition={{ duration: 0.4, ease: "easeInOut" }}
                            className="flex flex-col items-center"
                        >
                            <h1 
                                className="text-white text-4xl md:text-6xl font-light tracking-wide text-center"
                                style={{ textShadow: "0 0 35px rgba(255,255,255,0.35)" }}
                            >
                                Take a deep breath...
                            </h1>
                        </motion.div>
                    )}

                    {count === "starting" && (
                        <motion.div
                            key="starting"
                            initial={{ opacity: 0, y: 15, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(20px)" }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="flex flex-col items-center space-y-6"
                        >
                            <h1 
                                className="text-white text-5xl md:text-7xl font-light tracking-wide"
                                style={{ textShadow: "0 0 30px rgba(255,255,255,0.4)" }}
                            >
                                Interview starting...
                            </h1>
                            <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 1.0, ease: "easeInOut" }}
                                    className="h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

        </div>
    );
}
