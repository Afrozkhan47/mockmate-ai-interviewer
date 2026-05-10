"use client";

import React, { useEffect, useState, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SummaryModal } from "@/components/interview/SummaryModal";

interface InterviewHistoryItem {
    session_id: string;
    role?: string;
    interview_type?: string;
    status?: string;
    summary_id?: string | null;
    started_at?: number;
}

interface GrowthStatus {
    locked?: boolean;
    num_completed?: number;
}

interface SummaryData {
    overview: string;
    strengths: string[];
    improvements: string[];
    recommendations: string[];
    growth_insight?: string;
}

interface ToastState {
    message: string;
    type: "success" | "error";
}

function cleanRoleLabel(role?: string): string {
    if (!role) return "General Interview";
    const trimmed = role
        .replace(/\s+/g, " ")
        .split(/START DATE|APPLY BY|STIPEND|DURATION|RESPONSIBILITIES|REQUIREMENTS/i)[0]
        .trim();
    return (trimmed || role).slice(0, 56);
}

function parseSummaryData(input: unknown): SummaryData | null {
    if (!input || typeof input !== "object") return null;
    const raw = input as Record<string, unknown>;
    if (typeof raw.overview !== "string") return null;
    if (!Array.isArray(raw.strengths) || !Array.isArray(raw.improvements) || !Array.isArray(raw.recommendations)) {
        return null;
    }
    return {
        overview: raw.overview,
        strengths: raw.strengths.map(String),
        improvements: raw.improvements.map(String),
        recommendations: raw.recommendations.map(String),
        growth_insight: typeof raw.growth_insight === "string" ? raw.growth_insight : undefined,
    };
}

function DashboardContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");

    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [, setIsLoading] = useState(false);
    const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [growthData, setGrowthData] = useState<GrowthStatus | null>(null);
    const [toast, setToast] = useState<ToastState | null>(null);

    useEffect(() => {
        fetchHistory();
        fetchGrowthStatus();
        if (sessionId && sessionId !== "null" && sessionId !== "undefined" && typeof sessionId === "string") {
            setTimeout(() => {
                fetchSummary(sessionId);
            }, 100);
        }
    }, [sessionId]);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
    }, [toast]);

    const latestCompletedSession = useMemo(() => {
        if (!history || history.length === 0) return null;
        const sessionsWithSummary = history
            .filter(h => h.summary_id)
            .sort((a, b) => (Number(b.started_at) || 0) - (Number(a.started_at) || 0));
        return sessionsWithSummary[0] || null;
    }, [history]);

    const fetchSummary = async (id: string) => {
        if (!id || id === "null" || id === "undefined" || typeof id !== "string") return;

        setIsLoading(true);
        try {
            const response = await fetch(`/api/interviews/${encodeURIComponent(id)}/summary`);
            if (response.ok) {
                const data = await response.json();
                const parsed = parseSummaryData(data);
                if (parsed) {
                    setSummary(parsed);
                    setIsModalOpen(true);
                }
            } else if (response.status === 404) {
                const generateResponse = await fetch(`/api/summary?session_id=${encodeURIComponent(id)}`);
                if (generateResponse.ok) {
                    const generatedData = await generateResponse.json();
                    const parsedGenerated = parseSummaryData(generatedData);
                    if (parsedGenerated) {
                        setSummary(parsedGenerated);
                        setIsModalOpen(true);
                    }
                } else {
                    alert("Summary is currently being generated. Please wait 10-15 seconds and try again.");
                }
            }
        } catch (err) {
            console.error("Failed to fetch summary:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch("/api/interviews/history");
            if (res.ok) {
                const data = await res.json();
                setHistory(data || []);
            }
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchGrowthStatus = async () => {
        try {
            const res = await fetch("/api/interview/growth");
            if (res.ok) {
                const data = await res.json();
                setGrowthData(data);
            }
        } catch (e) {
            console.error("Failed to load growth status", e);
        }
    };

    const handleEditInterview = async (item: InterviewHistoryItem) => {
        const currentRole = cleanRoleLabel(item.role);
        const newRole = window.prompt("Edit interview role/title:", currentRole);
        if (!newRole || !newRole.trim()) return;

        try {
            const res = await fetch(`/api/interviews/${encodeURIComponent(item.session_id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole.trim() }),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || "Failed to update interview");
            }
            setHistory(prev =>
                prev.map(h => (h.session_id === item.session_id ? { ...h, role: newRole.trim() } : h))
            );
            setToast({ message: "Interview updated successfully.", type: "success" });
        } catch (e) {
            console.error("Failed to edit interview", e);
            setToast({ message: "Could not update this interview. Please try again.", type: "error" });
        }
    };

    const handleDeleteInterview = async (sessionIdToDelete: string) => {
        if (!sessionIdToDelete) return;
        const confirmed = window.confirm("Delete this interview and its summary permanently?");
        if (!confirmed) return;

        setDeletingSessionId(sessionIdToDelete);
        try {
            const res = await fetch(`/api/interviews/${encodeURIComponent(sessionIdToDelete)}`, { method: "DELETE" });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || "Failed to delete interview");
            }
            setHistory(prev => prev.filter(item => item.session_id !== sessionIdToDelete));
            if (summary && sessionId === sessionIdToDelete) {
                setIsModalOpen(false);
                setSummary(null);
            }
            setToast({ message: "Interview deleted successfully.", type: "success" });
        } catch (e) {
            console.error("Failed to delete interview", e);
            setToast({ message: "Could not delete this interview. Please try again.", type: "error" });
        } finally {
            setDeletingSessionId(null);
        }
    };

    const isGrowthLocked = growthData?.locked !== false;

    return (
        <div className="w-full max-w-7xl mx-auto py-6">
            {toast && (
                <div className="fixed top-6 right-6 z-[60]">
                    <div className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold ${
                        toast.type === "success"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-red-50 border-red-200 text-red-700"
                    }`}>
                        {toast.message}
                    </div>
                </div>
            )}
            <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-light text-gray-900 tracking-tight">Welcome back, <span className="font-semibold">Candidate</span></h2>
                    <p className="text-gray-500 mt-1 font-medium">Your progress is looking steady. Ready for another session?</p>
                </div>
                <Link href="/growth">
                    <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm">
                        {isGrowthLocked ? (
                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                        ) : (
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        )}
                        <span>Growth Insights</span>
                        {isGrowthLocked && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded ml-1 font-black uppercase text-gray-400">{growthData?.num_completed || 0}/2</span>}
                    </button>
                </Link>
            </header>

            {/* Quick Action: Start Interview */}
            <section className="mb-12">
                <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all hover:border-blue-100 hover:shadow-md">
                    <div className="space-y-1 text-center md:text-left">
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">Start a Mock Interview</h3>
                        <p className="text-gray-500 font-medium">Practice with AI and get instant feedback on your performance.</p>
                    </div>
                    <Link href="/interview/session">
                        <button className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/10 active:scale-95 flex items-center gap-3">
                            Begin Session
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </button>
                    </Link>
                </div>
            </section>

            {/* Main Stats (Horizontal) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-white p-7 rounded-[1.5rem] border border-gray-100 shadow-sm">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Total Practice</h4>
                    <p className="text-3xl font-bold text-gray-900 leading-none">{history.filter(h => h.status === 'COMPLETED').length} <span className="text-sm font-medium text-gray-400 ml-1">sessions</span></p>
                </div>

                <div className="bg-white p-7 rounded-[1.5rem] border border-gray-100 shadow-sm col-span-2 flex items-center justify-between group cursor-pointer hover:border-blue-100 transition-colors"
                    onClick={() => latestCompletedSession && fetchSummary(latestCompletedSession.session_id as string)}>
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Latest Feedback</h4>
                        <p className="text-lg font-bold text-gray-900 leading-none group-hover:text-blue-600 transition-colors truncate max-w-md">
                            {(latestCompletedSession?.role as string) || "Finish your first session to see results"}
                        </p>
                    </div>
                    {latestCompletedSession && (
                        <div className="text-blue-600 font-bold text-sm tracking-tight flex items-center gap-2">
                            Review Summary
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                    )}
                </div>
            </div>

            {/* Timeline History */}
            <section className="mt-16">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Interview History</h3>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{history.length} Total</span>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Date</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Time</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Role</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Type</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {historyLoading && (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-gray-400 font-medium animate-pulse italic">Consulting the archives...</td>
                                </tr>
                            )}
                            {!historyLoading && history.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-gray-400 font-medium italic">No past interviews found. Start your journey today.</td>
                                </tr>
                            )}
                            {history.map((item, index) => {
                                const startedAt = item.started_at as number;
                                const started = new Date(startedAt * 1000);
                                const dateStr = started.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                                const timeStr = started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
                                const canView = !!item.summary_id;
                                const roleLabel = cleanRoleLabel(item.role);

                                return (
                                    <tr key={(item.session_id as string) || index} className="group hover:bg-gray-50/30 transition-colors">
                                        <td className="px-6 py-5">
                                            <div className="text-sm font-bold text-gray-900">{dateStr}</div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-sm text-gray-600 font-medium">{timeStr}</div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-sm font-bold text-gray-900 tracking-tight max-w-[280px] truncate" title={item.role || roleLabel}>
                                                {roleLabel}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-xs text-blue-600/80 font-semibold uppercase tracking-wide">
                                                {(item.interview_type as string) || "General"}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${item.status === 'COMPLETED' ? 'bg-green-50 text-green-600' :
                                                item.status === 'ENDED_EARLY' ? 'bg-amber-50 text-amber-600' :
                                                    'bg-gray-50 text-gray-400'
                                                }`}>
                                                {(item.status as string).replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => fetchSummary(item.session_id as string)}
                                                    disabled={!canView}
                                                    className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Summary
                                                </button>
                                                <button
                                                    onClick={() => handleEditInterview(item)}
                                                    className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all shadow-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteInterview(item.session_id)}
                                                    disabled={deletingSessionId === item.session_id}
                                                    className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {deletingSessionId === item.session_id ? "Deleting..." : "Delete"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <SummaryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                summary={summary}
            />
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500 animate-pulse font-medium">Loading Dashboard...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
