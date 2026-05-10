class SpeechManager {
    private static instance: SpeechManager;
    private isPlaying: boolean = false;
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private voicesLoaded: boolean = false;
    private availableVoices: SpeechSynthesisVoice[] = [];

    private constructor() {
        this.initVoices();
    }

    public static getInstance(): SpeechManager {
        if (!SpeechManager.instance) {
            SpeechManager.instance = new SpeechManager();
        }
        return SpeechManager.instance;
    }

    private initVoices() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            const loadVoices = () => {
                this.availableVoices = window.speechSynthesis.getVoices();
                if (this.availableVoices.length > 0) {
                    this.voicesLoaded = true;
                    console.log("[TTS] Loaded available voices:", this.availableVoices.map(v => v.name));
                }
            };
            
            loadVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
        }
    }

    private getBestVoice(): SpeechSynthesisVoice | null {
        if (!this.voicesLoaded) {
            this.availableVoices = window.speechSynthesis.getVoices();
        }

        const voiceList = this.availableVoices;
        if (voiceList.length === 0) return null;

        // Priority list per requirements
        const priorities = ['siri', 'samantha', 'karen', 'moira'];
        
        for (const name of priorities) {
            const found = voiceList.find(v => v.name.toLowerCase().includes(name) && v.lang.startsWith('en'));
            if (found) return found;
        }

        // Fallback: any English female voice, or just the first English voice
        const fallback = voiceList.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) 
            || voiceList.find(v => v.lang.startsWith('en'));
            
        return fallback || voiceList[0];
    }

    /**
     * Synthesizes text via Web Speech API and plays the audio synchronized with callbacks.
     */
    public async playSpeech(
        text: string,
        onStart: () => void,
        onComplete: () => void,
        onError: (err: any) => void
    ): Promise<void> {
        // MUST immediately stop any stale speech before beginning a new utterance
        this.stop();

        if (typeof window === 'undefined' || !window.speechSynthesis) {
            console.warn("[TTS] Web Speech API not supported. Falling back to text-only mode.");
            onStart();
            setTimeout(onComplete, 3000);
            return;
        }

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            this.currentUtterance = utterance;

            const voice = this.getBestVoice();
            if (voice) {
                utterance.voice = voice;
                console.log(`[TTS] Selected voice: ${voice.name} (${voice.lang})`);
            } else {
                console.warn("[TTS] No premium voices found, using browser default.");
            }

            // Professional, calm pacing
            utterance.rate = 0.95;
            utterance.pitch = 1;
            utterance.volume = 1;

            // Synchronization: Only trigger 'speaking' state when audio physically starts
            utterance.onstart = () => {
                console.log("[TTS] Speech playback started.");
                this.isPlaying = true;
                onStart();
            };

            utterance.onend = () => {
                console.log("[TTS] Speech playback ended naturally.");
                this.cleanup();
                onComplete();
            };

            utterance.onerror = (e) => {
                if (e.error === 'canceled' || e.error === 'interrupted') {
                    console.log("[TTS] Speech cancelled intentionally via stop().");
                    return; 
                }
                console.error("[TTS] Speech Synthesis error:", e);
                this.cleanup();
                onError(e);
                
                // Fallback to text mode
                onStart();
                setTimeout(() => onComplete(), 3000);
            };

            // Start Playback
            window.speechSynthesis.speak(utterance);

        } catch (error) {
            console.error("[TTS] Critical speech generation error:", error);
            // Fallback safely so interview doesn't crash
            onStart();
            setTimeout(() => onComplete(), 3000);
            onError(error);
        }
    }

    /**
     * Instantly halts audio playback and cleans up resources.
     */
    public stop(): void {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel(); // Clears queue and stops current speech
        }
        this.cleanup();
    }

    private cleanup(): void {
        this.isPlaying = false;
        this.currentUtterance = null;
    }
}

export const speechManager = SpeechManager.getInstance();
