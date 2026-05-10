import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    GithubAuthProvider,
    signOut
} from "firebase/auth";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "./firebase";

// Providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// Error Mapping
const getErrorMessage = (error: any) => {
    if (!error) return "An unknown error occurred.";
    const code = error.code;
    switch (code) {
        case 'auth/email-already-in-use':
            return "This email is already registered. Please login instead.";
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return "Invalid email or password.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters.";
        case 'auth/popup-closed-by-user':
            return "Sign-in cancelled.";
        case 'auth/account-exists-with-different-credential':
            return "An account with this email already exists using a different sign-in method.";
        default:
            return error.message || "Authentication failed. Please try again.";
    }
};

export const AuthService = {
    // Email Signup
    signup: async (email: string, pass: string) => {
        try {
            const result = await createUserWithEmailAndPassword(auth, email, pass);
            return { user: result.user, error: null };
        } catch (error: any) {
            return { user: null, error: getErrorMessage(error) };
        }
    },

    // Email Login
    login: async (email: string, pass: string) => {
        try {
            const result = await signInWithEmailAndPassword(auth, email, pass);
            return { user: result.user, error: null };
        } catch (error: any) {
            return { user: null, error: getErrorMessage(error) };
        }
    },

    // Google Login
    loginWithGoogle: async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return { user: result.user, error: null };
        } catch (error: any) {
            // Logic for handling duplicate emails if needed
            return { user: null, error: getErrorMessage(error) };
        }
    },

    // GitHub Login
    loginWithGithub: async () => {
        try {
            const result = await signInWithPopup(auth, githubProvider);
            return { user: result.user, error: null };
        } catch (error: any) {
            return { user: null, error: getErrorMessage(error) };
        }
    },

    // Logout
    logout: async () => {
        try {
            await signOut(auth);
            return { error: null };
        } catch (error: any) {
            return { error: error.message };
        }
    }
};
