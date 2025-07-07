import React, { useState, useRef, useLayoutEffect } from 'react';
import { Color } from '../../mol-util/color';

type TooltipProps = {
    text: string;
    img: string;
    color?: Color;
};

export function Tooltip({ text, img, color }: TooltipProps) {
    const [show, setShow] = useState(false);
    const bubbleRef = useRef<HTMLDivElement>(null);

    const [bubbleStyle, setBubbleStyle] = useState<React.CSSProperties | undefined>(undefined);

    useLayoutEffect(() => {
        if (!show || !bubbleRef.current) return;

        const bubble = bubbleRef.current;
        const rect = bubble.getBoundingClientRect();
        const margin = 8;

        const style: React.CSSProperties = {
            top: '100%',
            left: '50%',
            transform: 'translate(-50%, 0)',
            marginTop: '0.25rem',
        };

        if (rect.right > window.innerWidth - margin) {
            style.left = 'auto';
            style.right = `${margin}px`;
            style.transform = 'none';
        } else if (rect.left < margin) {
            style.left = `${margin}px`;
            style.transform = 'none';
        }

        if (rect.bottom > window.innerHeight - margin) {
            style.top = 'auto';
            style.bottom = '100%';
            style.marginTop = undefined;
            style.marginBottom = '0.25rem';
        }

        setBubbleStyle(style);
    }, [show]);

    return (
        <div
            className="flex"
            style={{ backgroundColor: color ? Color.toStyle(color) : undefined }}
        >
            <div
                className="relative m-auto"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >

                <img
                    className="w-4 cursor-pointer"
                    src={img}
                    alt="tooltip icon"
                    onClick={() => window.goToAbout?.('help', 'theCanaAlphabet')}
                />

                {show && (
                    <div
                        ref={bubbleRef}
                        style={bubbleStyle}
                        className="absolute min-w-[10rem] max-w-[13rem] z-[1000] whitespace-normal break-words rounded bg-full-white px-2 py-1 text-sm text-black shadow-lg ring pointer-events-none transition-opacity duration-200"
                    >
                        {text}
                    </div>
                )}
            </div>
        </div>
    );
};

declare global {
  interface Window {
    goToAbout?: (tab?: string, anchor?: string) => void;
  }
}