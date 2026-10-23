import React from "react";

/* Matches the bot bubble shape from ChatbotWidget without @mui/material */
export const TypingDots = () => (
    <div
        className="inline-flex items-center px-4 py-2.5 rounded-[18px_18px_18px_5px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] w-fit"
        style={{
            background: "var(--glass-bg, rgba(255,255,255,0.97))",
            border: "1px solid var(--glass-border-color, rgba(214,228,240,0.70))",
        }}
    >
        <style dangerouslySetInnerHTML={{__html: `
            @keyframes dotBounce {
                0%, 80%, 100% { transform: scale(0.7) translateY(0); opacity: 0.3; }
                40% { transform: scale(1.2) translateY(-4px); opacity: 1; }
            }
        `}} />
        <div className="flex items-center gap-[5px]">
            {[0, 0.18, 0.36].map((delay, i) => (
                <span
                    key={i}
                    className="block w-[7px] h-[7px] rounded-full"
                    style={{
                        background: "var(--accent-primary, #2374F2)",
                        animation: `dotBounce 1.3s ease-in-out ${delay}s infinite`,
                    }}
                />
            ))}
        </div>
    </div>
);
