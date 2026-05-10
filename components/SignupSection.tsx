"use client";

import { useState } from "react";
import { AuthService } from "@/lib/authService";
import { useRouter } from "next/navigation";

export function SignupSection() {
    // UI State
    const [isLogin, setIsLogin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [authLoadingProvider, setAuthLoadingProvider] = useState<string | null>(null); // 'email', 'google', 'github'
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const router = useRouter();

    // Reset error when toggling mode
    const toggleMode = () => {
        setIsLogin(!isLogin);
        setError(null);
    };

    // Handle Email Auth
    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        setAuthLoadingProvider('email');

        let result;
        if (isLogin) {
            result = await AuthService.login(email, password);
        } else {
            result = await AuthService.signup(email, password);
        }

        if (result.error) {
            setError(result.error);
            setLoading(false);
            setAuthLoadingProvider(null);
        } else {
            // Redirect on success (router.push might happen before component unmounts)
            router.push("/dashboard");
        }
    };

    // Handle OAuth
    const handleOAuth = async (provider: 'google' | 'github') => {
        setError(null);
        setLoading(true);
        setAuthLoadingProvider(provider);

        let result;
        if (provider === 'google') {
            result = await AuthService.loginWithGoogle();
        } else {
            result = await AuthService.loginWithGithub();
        }

        if (result.error) {
            setError(result.error);
            setLoading(false);
            setAuthLoadingProvider(null);
        } else {
            router.push("/dashboard");
        }
    };

    return (
        <section className="min-h-screen relative flex items-center justify-center px-6 py-24 overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/signup_bg.png"
                    alt="Background"
                    className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]/50 mix-blend-multiply" />
            </div>

            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold tracking-tight text-white mb-2">
                        MockMate
                    </h2>
                    <p className="text-lg text-white/80 font-light">
                        Your AI Interview Companion
                    </p>
                    <div className="h-px w-16 bg-white/20 mx-auto my-6" />

                    <h3 className="text-xl font-light tracking-tight text-white">
                        {isLogin ? "Welcome back" : "Begin your preparation"}
                    </h3>
                    <p className="text-sm text-neutral-400">
                        {isLogin ? "Login to continue your progress." : "Create your account to start practicing."}
                    </p>
                </div>

                <form className="space-y-4" onSubmit={handleEmailAuth}>
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="email" className="text-xs uppercase tracking-wider text-neutral-600 font-medium ml-1">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-neutral-700 disabled:opacity-50"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="pass" className="text-xs uppercase tracking-wider text-neutral-600 font-medium ml-1">
                            Password
                        </label>
                        <input
                            id="pass"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-neutral-700 disabled:opacity-50"
                            required
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-white text-black hover:bg-neutral-200 transition-colors font-medium rounded-lg px-4 py-3 mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {authLoadingProvider === 'email' ? (
                            <span className="animate-pulse">Processing...</span>
                        ) : (
                            isLogin ? "Log In" : "Create Account"
                        )}
                    </button>
                </form>

                <div className="text-center">
                    <button
                        onClick={toggleMode}
                        disabled={loading}
                        className="text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-[#050505] px-2 text-neutral-600">
                            Or continue with
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => handleOAuth('google')}
                        disabled={loading}
                        className="flex items-center justify-center px-4 py-2 border border-white/10 rounded-lg text-neutral-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {authLoadingProvider === 'google' ? (
                            <span className="text-sm animate-pulse">Loading...</span>
                        ) : (
                            <>
                                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .533 5.333.533 12S5.867 24 12.48 24c3.44 0 6.04-1.133 8.16-3.293 2.16-2.16 2.84-5.213 2.627-7.627H12.48z" />
                                </svg>
                                <span className="text-sm">Google</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => handleOAuth('github')}
                        disabled={loading}
                        className="flex items-center justify-center px-4 py-2 border border-white/10 rounded-lg text-neutral-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {authLoadingProvider === 'github' ? (
                            <span className="text-sm animate-pulse">Loading...</span>
                        ) : (
                            <>
                                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm">GitHub</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </section>
    );
}
