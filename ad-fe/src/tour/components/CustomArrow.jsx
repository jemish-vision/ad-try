import React from 'react';

const ARROW_COLOR = '#1A82F4';

export const CustomArrow = ({ placement }) => {
    if (!placement || placement === 'center') return null;

    const isTop = placement.startsWith('top');
    const isBottom = placement.startsWith('bottom');
    const isLeft = placement.startsWith('left');
    const isRight = placement.startsWith('right');

    if (isTop || isBottom) {
        /**
         * placement='bottom' → tooltip is BELOW target → arrow must point UP
         * placement='top'    → tooltip is ABOVE target → arrow must point DOWN
         *
         * Canonical SVG drawn bottom-to-top (arrow points UP toward target above).
         * For 'top' placement (arrow must point DOWN), we rotate 180deg.
         *
         * Curve path: starts at bottom-center, bows LEFT then RIGHT (S-curve),
         * ends at top-center. This matches the reference image exactly.
         */
        const W = 32, H = 60;
        const cx = W / 2; // 16

        // Path: M = start at bottom, cubic bezier bows left mid, arrives top-center
        // C x1 y1, x2 y2, x y  — control points create the S-bow visible in reference
        const curvePath = `M${cx} ${H - 4} C ${cx - 8} ${H - 16}, ${cx + 8} 28, ${cx} 8`;

        // Arrowhead chevron pointing UP (toward top of SVG)
        const arrowHead = `M${cx - 8} 18 L${cx} 4 L${cx + 8} 18`;

        const transform = isTop ? 'rotate(180deg)' : 'none';

        return (
            <div className="flex items-center justify-center" >
                <svg
                    width={W}
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ display: 'block', transform }}
                    aria-hidden="true"
                >
                    <path
                        d={curvePath}
                        stroke={ARROW_COLOR}
                        strokeWidth="3"
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        fill="none"
                    />
                    <path
                        d={arrowHead}
                        stroke={ARROW_COLOR}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </svg>
            </div>
        );
    }

    if (isLeft || isRight) {
        /**
         * placement='right' → tooltip is RIGHT of target → arrow points LEFT
         * placement='left'  → tooltip is LEFT of target  → arrow points RIGHT
         *
         * Canonical SVG: points RIGHT. Rotate 180deg for 'right' placement.
         */
        const W = 60, H = 32;
        const cy = H / 2; // 16

        const curvePath = `M4 ${cy} C 16 ${cy - 8}, 28 ${cy + 8}, ${W - 8} ${cy}`;
        const arrowHead = `M${W - 18} ${cy - 8} L${W - 4} ${cy} L${W - 18} ${cy + 8}`;

        const transform = isRight ? 'rotate(180deg)' : 'none';

        return (
            <div className="flex items-center justify-center" >
                <svg
                    width={W}
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ display: 'block', transform }}
                    aria-hidden="true"
                >
                    <path
                        d={curvePath}
                        stroke={ARROW_COLOR}
                        strokeWidth="3"
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        fill="none"
                    />
                    <path
                        d={arrowHead}
                        stroke={ARROW_COLOR}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </svg>
            </div>
        );
    }

    return null;
};