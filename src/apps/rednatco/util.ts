import { Color } from '../../mol-util/color';

/* https://alienryderflex.com/hsp.html */
export function luminance(color: Color) {
    let [r, g, b] = Color.toRgb(color);
    r /= 255.0;
    g /= 255.0;
    b /= 255.0;
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}
