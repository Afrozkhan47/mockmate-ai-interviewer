"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SummaryData {
    overview: string;
    strengths: string[];
    improvements: string[];
    recommendations: string[];
    growth_insight?: string;
}

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: SummaryData | null;
}

export function SummaryModal({ isOpen, onClose, summary }: SummaryModalProps) {
    const [showGrowthInsights, setShowGrowthInsights] = React.useState(false);

    if (!isOpen || !summary) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Interview Summary</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                        {/* 1. Overview */}
                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">1. Interview Overview</h3>
                            <p className="text-gray-700 leading-relaxed text-lg italic">
                                &quot;{summary.overview}&quot;
                            </p>
                        </section>

                        {/* 2. Key Strengths */}
                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">2. Key Strengths</h3>
                            <div className="space-y-3">
                                {summary.strengths.map((strength, i) => (
                                    <div key={i} className="flex items-start gap-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                        <div className="w-6 h-6 bg-indigo-500 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold">
                                            {i + 1}
                                        </div>
                                        <p className="text-gray-800 font-medium">{strength}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 3. Areas to Improve */}
                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">3. Areas to Improve</h3>
                            <div className="space-y-3">
                                {summary.improvements.map((improvement, i) => (
                                    <div key={i} className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                        <div className="w-6 h-6 bg-gray-400 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold">
                                            {i + 1}
                                        </div>
                                        <p className="text-gray-800">{improvement}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 4. Focus Recommendations */}
                        <section className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">4. Focus Recommendations</h3>
                            <div className="space-y-3">
                                {summary.recommendations.map((rec, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 shrink-0" />
                                        <p className="text-gray-800 leading-relaxed font-medium text-sm">
                                            {rec}
                                        </p>
                                    </div>
                                ))}
                                {(!summary.recommendations || summary.recommendations.length === 0) && (
                                    <p className="text-gray-500 italic text-sm">No specific recommendations yet. Keep practicing!</p>
                                )}
                            </div>
                        </section>

                        {/* UX Closure Note */}
                        <div className="text-center pt-4">
                            <p className="text-sm text-gray-500 italic">
                                Use this feedback to prepare better for your next mock interview.
                            </p>
                        </div>

                        {/* Growth Insights Section (Collapsible) */}
                        {summary.growth_insight && (
                            <section className="mt-6">
                                <button
                                    onClick={() => setShowGrowthInsights(!showGrowthInsights)}
                                    className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 rounded-2xl border border-indigo-100 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </div>
                                        <div className="text-left">
                                            <h3 className="text-sm font-bold text-indigo-900">Growth Insights</h3>
                                            <p className="text-xs text-indigo-600">Pattern analysis & practice recommendations</p>
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-5 h-5 text-indigo-500 transition-transform ${showGrowthInsights ? 'rotate-180' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {showGrowthInsights && (
                                    <div className="mt-4 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                                        <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed">
                                            {summary.growth_insight}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md active:scale-95"
                        >
                            Got it
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
