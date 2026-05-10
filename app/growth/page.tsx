"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function GrowthPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchGrowth = async () => {
            try {
                const res = await fetch("/api/interview/growth");
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch (err) {
                console.error("Failed to fetch growth insights:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchGrowth();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-6">
                <div className="text-gray-400 font-medium animate-pulse">Calculating your growth trajectory...</div>
            </div>
        );
    }

    if (!data || data.locked) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white p-12 rounded-[2rem] shadow-sm border border-gray-100 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8">
                        <svg className="w-10 h-10 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Growth Insights Locked</h1>
                    <p className="text-gray-500 mb-2 leading-relaxed">
                        Complete at least 2 interviews to unlock performance trends and coaching insights.
                    </p>
                    <p className="text-sm font-bold text-indigo-600 bg-indigo-50 inline-block px-4 py-1 rounded-full">
                        You’ve completed {data?.num_completed || 0} of 2 required sessions.
                    </p>
                    <div className="mt-10">
                        <Link href="/dashboard">
                            <button className="text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors">
                                ← Back to Dashboard
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans pb-24">
            {/* Minimalist Header */}
            <header className="fixed top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/dashboard" className="text-gray-400 hover:text-blue-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-lg font-bold tracking-tight">Growth Insights</h1>
                    </div>
                    <div className="text-[10px] font-black uppercase text-gray-300 tracking-[0.2em]">Auto-updated after session</div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-8 pt-32 space-y-24">
                {/* Introduction */}
                <section className="space-y-4">
                    <p className="text-gray-500 font-medium leading-relaxed max-w-2xl">
                        Your performance is analyzed across all recent sessions to detect long-term patterns and provide a personalized roadmap for reaching your goals.
                    </p>
                </section>

                {/* SECTION 1: OVERVIEW */}
                <section className="space-y-12">
                    <div className="space-y-2">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">01. Overview</h2>
                        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">Performance Trend</h3>
                        <p className="text-xl text-gray-700 font-medium leading-relaxed pt-2">{data.performance_trend}</p>
                    </div>

                    <div className="space-y-10">
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                Consistent Strengths
                            </h4>
                            <ul className="space-y-3 pl-4">
                                {data.consistent_strengths.map((s: string, i: number) => (
                                    <li key={i} className="text-gray-600 font-medium flex items-center gap-3">
                                        <span className="text-gray-200">—</span>
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                                Remaining Weaknesses
                            </h4>
                            <ul className="space-y-3 pl-4">
                                {(data.remaining_weaknesses || data.recurring_improvements || []).map((w: string, i: number) => (
                                    <li key={i} className="text-gray-600 font-medium flex items-center gap-3">
                                        <span className="text-gray-200">—</span>
                                        {w}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <h4 className="text-sm font-bold text-blue-600 mb-2">Primary Recommended Focus</h4>
                            <p className="text-lg text-gray-700 font-medium leading-relaxed">{data.recommended_focus}</p>
                        </div>
                    </div>
                </section>

                {/* SECTION 2: PROGRESS TRACKING */}
                {data.improved_areas && data.improved_areas.length > 0 && (
                    <section className="space-y-12">
                        <div className="space-y-2">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-green-600">02. Progress Tracking</h2>
                            <h3 className="text-3xl font-bold text-gray-900 tracking-tight">Areas You've Improved</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {data.improved_areas.map((area: string, i: number) => (
                                <div key={i} className="bg-green-50/50 p-6 rounded-3xl border border-green-100/50 flex items-start gap-4">
                                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <p className="text-gray-800 font-bold leading-tight">{area}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* SECTION 3: QUESTION REVIEW */}
                <section className="space-y-12">
                    <div className="space-y-2">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">03. Question Analysis</h2>
                        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">Detailed Question Review</h3>
                    </div>

                    <div className="space-y-20">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {data.question_review.map((item: any, idx: number) => (
                            <div key={idx} className="space-y-8">
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-black uppercase tracking-widest">Question {idx + 1}</div>
                                    <h4 className="text-2xl font-bold text-gray-900 leading-tight">{item.question}</h4>
                                    <div className="w-full h-[1px] bg-gray-100"></div>
                                </div>

                                <div className="space-y-12 pl-4 border-l-2 border-gray-50 ml-2">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Answer Summary</label>
                                        <p className="text-gray-600 italic font-medium">&quot;{item.answer_summary}&quot;</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-12">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-green-600 uppercase tracking-widest">What You Did Well</label>
                                            <p className="text-gray-800 font-medium leading-relaxed">{item.did_well}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">What To Improve</label>
                                            <p className="text-gray-800 font-medium leading-relaxed">{item.to_improve}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4">
                                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Stronger Example Response</label>
                                        <div className="bg-gray-50/50 p-6 rounded-2xl text-gray-700 font-medium leading-relaxed border border-gray-50">
                                            {item.stronger_example}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* SECTION 4: 7-DAY PLAN */}
                <section className="space-y-12">
                    <div className="space-y-2">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">04. Strategy</h2>
                        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">Your 7-Day Improvement Plan</h3>
                    </div>

                    <div className="space-y-0 divide-y divide-gray-100 border-y border-gray-100">
                        {data.improvement_plan_7_day.map((step: string, idx: number) => (
                            <div key={idx} className="flex gap-8 py-8 items-start group">
                                <div className="text-sm font-black text-gray-200 group-hover:text-blue-200 transition-colors pt-1">
                                    {String(idx + 1).padStart(2, '0')}
                                </div>
                                <p className="text-lg text-gray-700 font-medium leading-relaxed group-hover:text-gray-900 transition-colors">
                                    {step}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Footer Link */}
                <div className="pt-12 flex justify-center">
                    <Link href="/dashboard">
                        <button className="text-sm font-bold text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Dashboard
                        </button>
                    </Link>
                </div>
            </main>
        </div>
    );
}
