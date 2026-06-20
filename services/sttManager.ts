// services/sttManager.ts

export type STTResultCallback = (interimTranscript: string, finalTranscript: string) => void;
export type STTErrorCallback = (error: string) => void;
export type STTStateCallback = (isListening: boolean) => void;

class STTManager {
    private recognition: any = null;
    public isListening: boolean = false;
    private isStarting: boolean = false;
    private isStopping: boolean = false;
    private pendingStart: (() => void) | null = null;
    private pendingStop: boolean = false;

    private onResultCallback: STTResultCallback | null = null;
    private onErrorCallback: STTErrorCallback | null = null;
    private onStateChangeCallback: STTStateCallback | null = null;

    constructor() {
        if (typeof window !== "undefined") {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                this.recognition.lang = 'en-US';

                this.recognition.onstart = () => {
                    this.isListening = true;
                    this.isStarting = false;
                    
                    if (this.onStateChangeCallback) {
                        this.onStateChangeCallback(true);
                    }

                    if (this.pendingStop) {
                        this.pendingStop = false;
                        this.stopListening();
                    }
                };

                this.recognition.onend = () => {
                    this.isListening = false;
                    this.isStarting = false;
                    this.isStopping = false;
                    this.pendingStop = false;

                    if (this.onStateChangeCallback) {
                        this.onStateChangeCallback(false);
                    }

                    if (this.pendingStart) {
                        const startFn = this.pendingStart;
                        this.pendingStart = null;
                        startFn();
                    }
                };

                this.recognition.onerror = (event: any) => {
                    const err = event.error;
                    console.warn("[STT] Speech Recognition Error Event:", err);

                    // Under error conditions, reset temporary flags to prevent lockups
                    this.isStarting = false;
                    this.pendingStop = false;

                    // Handle SpeechRecognition abort events gracefully.
                    // Do not treat normal browser stop/restart behavior as application errors.
                    if (err === "aborted" || err === "no-speech") {
                        return;
                    }

                    // Only surface genuine failures:
                    // - microphone permission denied ('not-allowed')
                    // - microphone unavailable ('audio-capture')
                    // - actual recognition failure
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                };

                this.recognition.onresult = (event: any) => {
                    let interim = "";
                    let final = "";

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            final += event.results[i][0].transcript;
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }

                    if (this.onResultCallback) {
                        this.onResultCallback(interim, final);
                    }
                };
            }
        }
    }

    public isSupported(): boolean {
        return this.recognition !== null;
    }

    public startListening(
        onResult: STTResultCallback, 
        onStateChange: STTStateCallback, 
        onError?: STTErrorCallback
    ) {
        if (!this.isSupported()) {
            if (onError) onError("Browser not supported");
            return;
        }

        // Reset any pending stop flag
        this.pendingStop = false;

        // If currently stopping, queue the start request
        if (this.isStopping) {
            this.pendingStart = () => this.startListening(onResult, onStateChange, onError);
            return;
        }

        // Prevent start() when already listening or starting
        if (this.isListening || this.isStarting) {
            return;
        }

        this.onResultCallback = onResult;
        this.onStateChangeCallback = onStateChange;
        if (onError) this.onErrorCallback = onError;

        this.isStarting = true;
        try {
            this.recognition.start();
        } catch (err) {
            console.error("[STT] Failed to start SpeechRecognition", err);
            this.isStarting = false;
            this.isListening = false;
            if (this.onStateChangeCallback) this.onStateChangeCallback(false);
            if (onError) onError("failed-to-start");
        }
    }

    public stopListening() {
        if (!this.isSupported()) return;

        // Cancel any pending start request
        this.pendingStart = null;

        // If currently starting, queue a stop
        if (this.isStarting) {
            this.pendingStop = true;
            return;
        }

        // Prevent stop() when already stopped or stopping
        if (!this.isListening || this.isStopping) {
            return;
        }

        this.isStopping = true;
        try {
            this.recognition.stop();
        } catch (err) {
            console.error("[STT] Failed to stop SpeechRecognition", err);
            this.isStopping = false;
            this.isListening = false;
            if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        }
    }
}

export const sttManager = new STTManager();
