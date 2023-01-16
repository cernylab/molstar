import { Color } from '../../mol-util/color';
import { parseInt as parseIntMS, parseFloat as parseFloatMS } from '../../mol-io/reader/common/text/number-parser';

const Zero = '0'.charCodeAt(0);
const Period = '.'.charCodeAt(0);

export function clampDecimals(s: string, maxNumDecimals: number) {
    const idx = s.lastIndexOf('.');
    if (idx < 0)
        return s;
    return maxNumDecimals === 0 ? s.substring(0, idx) : s.substring(0, idx + maxNumDecimals + 1);
}

export function fuzzyCmp(a: number, b: number, relativeTolerance = 0.00001) {
    const TOL = a * relativeTolerance;
    return Math.abs(a - b) <= TOL;
}

export function isoBounds(min: number, max: number): { min: number, max: number, step: number } {
    let diff = max - min;
    if (diff <= 0.0)
        return { min, max, step: 0.01 }; // This should never happen

    diff /= 25;
    const l = Math.floor(Math.log10(diff));
    const step = Math.pow(10.0, l);

    min = Math.floor((min - step) / step) * step;
    max = Math.floor((max + step) / step) * step;

    return { min, max, step };
}

export function isoToFixed(iso: number, step: number) {
    const d = Math.log10(step);
    if (d >= 0)
        return parseFloat(iso.toFixed(0));
    return parseFloat(iso.toFixed(-d));
}

/* https://alienryderflex.com/hsp.html */
export function luminance(color: Color) {
    let [r, g, b] = Color.toRgb(color);
    r /= 255.0;
    g /= 255.0;
    b /= 255.0;
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}

export function numDecimals(s: string) {
    const idx = s.lastIndexOf('.');
    return idx >= 0 ? s.length - idx - 1 : 0;
}

export function prettyIso(iso: number, step: number) {
    return Math.floor((iso - step) / step) * step + step;
}

export function reduceDecimals(s: string) {
    const delimIdx = s.lastIndexOf('.');
    if (delimIdx < 0)
        return s;
    else if (delimIdx === s.length - 1)
        return s.substring(0, s.length - 1);

    let idx = s.length - 1;
    for (; idx > delimIdx; idx--) {
        if (s.charCodeAt(idx) !== Zero)
            break;
    }
    const noDot = s.charCodeAt(idx) === Period ? 0 : 1;

    return s.substring(0, idx + noDot);
}

export function stof(s: string) {
    if (s.length === 0)
        return void 0;
    if (s === '-')
        return void 0;
    const n = parseFloatMS(s, 0, s.length);
    return isNaN(n) ? undefined : n;
}

export function stoi(s: string) {
    if (s.length === 0)
        return void 0;
    if (s === '-')
        return void 0;
    const n = parseIntMS(s, 0, s.length);
    return isNaN(n) ? undefined : n;
}

export function toggleArray<T>(array: T[], elem: T) {
    if (array.includes(elem))
        return array.filter((x) => x !== elem);
    else {
        array.push(elem);
        return array;
    }
}
