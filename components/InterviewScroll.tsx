"use client";

import { useScroll, useTransform, motion, useMotionValueEvent } from "framer-motion";
import { useRef, useEffect, useState } from "react";

export function InterviewScroll() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [images, setImages] = useState<HTMLImageElement[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Total frames in the sequence
    const frameCount = 80;

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"],
    });

    // Map scroll (0 to 1) to frame index (0 to frameCount - 1)
    const frameIndex = useTransform(scrollYProgress, [0, 1], [0, frameCount - 1]);

    // Text Overlay Opacity: Appears ONLY at the very end
    const textOpacity = useTransform(scrollYProgress, [0.85, 0.95], [0, 1]);

    useEffect(() => {
        const loadImages = async () => {
            const loadedImages: HTMLImageElement[] = [];

            for (let i = 1; i <= frameCount; i++) {
                const img = new Image();
                const strIndex = i.toString().padStart(3, "0");
                img.src = `/SEQ2/ezgif-frame-${strIndex}.jpg`;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                loadedImages.push(img);
            }

            setImages(loadedImages);
            setIsLoaded(true);
        };

        loadImages();
    }, []);

    // Render loop
    useMotionValueEvent(frameIndex, "change", (latest) => {
        const canvas = canvasRef.current;
        if (!canvas || !isLoaded || images.length === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const index = Math.min(
            frameCount - 1,
            Math.max(0, Math.round(latest))
        );

        const img = images[index];
        if (!img) return;

        // Handle high DPI
        const dpr = window.devicePixelRatio || 1;
        // Set canvas dimensions to match window/container if strictly needed, 
        // or keep fixed aspect ratio. Let's make it responsive.
        // For now, drawing the image covering the canvas.

        // We'll update canvas size to match the image or viewport in a separate effect or ResizeObserver,
        // but for smooth scrubbing, we assume canvas is sized via CSS and we scale logic here.

        // Simple draw:
        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;

        // Sync internal resolution
        if (canvas.width !== canvasWidth * dpr || canvas.height !== canvasHeight * dpr) {
            canvas.width = canvasWidth * dpr;
            canvas.height = canvasHeight * dpr;
            ctx.scale(dpr, dpr);
        }

        // "Contain" object-fit logic for drawing
        const imgRatio = img.width / img.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (canvasRatio > imgRatio) {
            drawHeight = canvasHeight;
            drawWidth = canvasHeight * imgRatio;
            offsetX = (canvasWidth - drawWidth) / 2;
            offsetY = 0;
        } else {
            drawWidth = canvasWidth;
            drawHeight = canvasWidth / imgRatio;
            offsetX = 0;
            offsetY = (canvasHeight - drawHeight) / 2;
        }

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    });

    // Initial draw once loaded
    useEffect(() => {
        if (isLoaded && images.length > 0 && canvasRef.current) {
            // Trigger a manual update to draw first frame
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            const img = images[0];
            if (ctx && img) {
                // Simplified draw logic just to show *something* initially
                // The useMotionValueEvent will take over on scroll
                const dpr = window.devicePixelRatio || 1;
                const w = canvas.clientWidth;
                const h = canvas.clientHeight;
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                ctx.scale(dpr, dpr);

                // "Contain" logic
                const imgRatio = img.width / img.height;
                const canvasRatio = w / h;
                let dw, dh, ox, oy;
                if (canvasRatio > imgRatio) {
                    dh = h; dw = h * imgRatio; ox = (w - dw) / 2; oy = 0;
                } else {
                    dw = w; dh = w / imgRatio; ox = 0; oy = (h - dh) / 2;
                }
                ctx.drawImage(img, ox, oy, dw, dh);
            }
        }
    }, [isLoaded, images]);

    return (
        <section ref={containerRef} className="relative h-[200vh] bg-[#050505]">
            <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">

                {/* Loading State */}
                {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm">
                        Loading Sequence...
                    </div>
                )}

                {/* Canvas for Sequence */}
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain"
                />

                {/* Text Overlay */}
                <motion.div
                    style={{ opacity: textOpacity }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                >
                    <h2 className="text-3xl md:text-5xl font-light tracking-tight text-white/90 drop-shadow-lg text-center mix-blend-overlay">

                    </h2>
                </motion.div>

            </div>
        </section>
    );
}
