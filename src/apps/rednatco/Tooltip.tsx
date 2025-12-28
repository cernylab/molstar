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

    // Check if we're in a DNATCO analysis view where we want to preserve Mol* state
    const isInAnalysisView = window.location.pathname.match(/^\/app\/dnatco\/(annotation|validation|refinement|downloads)/);

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

                <a
                    href='/app/about/help#ntcFamilies'
                    target={isInAnalysisView ? '_blank' : undefined}
                    rel={isInAnalysisView ? 'noopener noreferrer' : undefined}
                >
                    <img
                        className="w-4 cursor-pointer"
                        src={img}
                        alt="tooltip icon"
                    />
                </a>

                {show && (
                    <div
                        ref={bubbleRef}
                        style={bubbleStyle}
                        className="absolute min-w-[10rem] max-w-[13rem] z-[1000] break-words rounded bg-full-white px-2 py-1 text-sm text-black shadow-lg ring pointer-events-none transition-opacity duration-200 whitespace-pre-line"
                    >
                        {text}
                    </div>
                )}
            </div>
        </div>
    );
};