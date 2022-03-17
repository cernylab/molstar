/**
 * Copyright (c) 2018-2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Lada Biedermannová <Lada.Biedermannova@ibt.cas.cz>
 * @author Jiří Černý <jiri.cerny@ibt.cas.cz>
 * @author Michal Malý <michal.maly@ibt.cas.cz>
 * @author Bohdan Schneider <Bohdan.Schneider@ibt.cas.cz>
 */

import { Color } from '../../mol-util/color';

function ntxs(num: number) {
    num = Math.round(num);
    const str = num.toString(16);
    return num < 16 ? '0' + str : str;
}

export namespace Colors {
    export function colorFromRgb(r: number, g: number, b: number) {
        return Color.fromRgb(r, g, b);
    }

    export function colorFromHsv(h: number, s: number, v: number) {
        const { r, g, b } = hsv2rgb(h, s, v);
        return Color.fromRgb(r, g, b);
    }

    export function colorToHexString(clr: number) {
        const [r, g, b] = Color.toRgb(Color(clr));
        return rgbToHexString(r, g, b);
    }

    export function colorToHsv(clr: number) {
        const [r, g, b] = Color.toRgb(Color(clr));
        return rgb2hsv(r, g, b);
    }

    export function colorToRgb(clr: number) {
        const [r, g, b] = Color.toRgb(Color(clr));
        return { r, g, b };
    }

    export function hsv2rgb(h: number, s: number, v: number): { r: number, g: number, b: number } {
        const f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
        return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
    }

    export function hsvToColor(h: number, s: number, v: number) {
        const { r, g, b } = hsv2rgb(h, s, v);
        return Color.fromRgb(r, g, b);
    }

    export function hsvToHexString(h: number, s: number, v: number) {
        const { r, g, b } = hsv2rgb(h, s, v);
        return rgbToHexString(r, g, b);
    }

    export function rgbToHexString(r: number, g: number, b: number) {
        return `#${ntxs(r)}${ntxs(g)}${ntxs(b)}`;
    }

    export function rgb2hsv(r: number, g: number, b: number) {
        const rabs = r / 255;
        const gabs = g / 255;
        const babs = b / 255;
        const v = Math.max(rabs, gabs, babs);
        const diff = v - Math.min(rabs, gabs, babs);
        const diffc = (c: number) => (v - c) / 6 / diff + 1 / 2;

        let h = 0;
        let s = 0;

        if (diff !== 0) {
            s = diff / v;
            const rr = diffc(rabs);
            const gg = diffc(gabs);
            const bb = diffc(babs);

            if (rabs === v) {
                h = bb - gg;
            } else if (gabs === v) {
                h = (1 / 3) + rr - bb;
            } else if (babs === v) {
                h = (2 / 3) + gg - rr;
            }

            if (h < 0) {
                h += 1;
            } else if (h > 1) {
                h -= 1;
            }
        }

        return { h: h * 360, s, v };
    }
}

export namespace NtCColors {
    export const Classes = {
        A: Color(0xFFC1C1),
        B: Color(0xC8CFFF),
        BII: Color(0x0059DA),
        miB: Color(0x3BE8FB),
        Z: Color(0x01F60E),
        IC: Color(0xFA5CFB),
        OPN: Color(0xE90000),
        SYN: Color(0xFFFF01),
        N: Color(0xF2F2F2),
    };
    export type Classes = typeof Classes;

    export const Conformers = {
        NANT_Upr: Classes.N,
        NANT_Lwr: Classes.N,
        AA00_Upr: Classes.A,
        AA00_Lwr: Classes.A,
        AA02_Upr: Classes.A,
        AA02_Lwr: Classes.A,
        AA03_Upr: Classes.A,
        AA03_Lwr: Classes.A,
        AA04_Upr: Classes.A,
        AA04_Lwr: Classes.A,
        AA08_Upr: Classes.A,
        AA08_Lwr: Classes.A,
        AA09_Upr: Classes.A,
        AA09_Lwr: Classes.A,
        AA01_Upr: Classes.A,
        AA01_Lwr: Classes.A,
        AA05_Upr: Classes.A,
        AA05_Lwr: Classes.A,
        AA06_Upr: Classes.A,
        AA06_Lwr: Classes.A,
        AA10_Upr: Classes.A,
        AA10_Lwr: Classes.A,
        AA11_Upr: Classes.A,
        AA11_Lwr: Classes.A,
        AA07_Upr: Classes.A,
        AA07_Lwr: Classes.A,
        AA12_Upr: Classes.A,
        AA12_Lwr: Classes.A,
        AA13_Upr: Classes.A,
        AA13_Lwr: Classes.A,
        AB01_Upr: Classes.A,
        AB01_Lwr: Classes.B,
        AB02_Upr: Classes.A,
        AB02_Lwr: Classes.B,
        AB03_Upr: Classes.A,
        AB03_Lwr: Classes.B,
        AB04_Upr: Classes.A,
        AB04_Lwr: Classes.B,
        AB05_Upr: Classes.A,
        AB05_Lwr: Classes.B,
        BA01_Upr: Classes.B,
        BA01_Lwr: Classes.A,
        BA05_Upr: Classes.B,
        BA05_Lwr: Classes.A,
        BA09_Upr: Classes.B,
        BA09_Lwr: Classes.A,
        BA08_Upr: Classes.BII,
        BA08_Lwr: Classes.A,
        BA10_Upr: Classes.B,
        BA10_Lwr: Classes.A,
        BA13_Upr: Classes.BII,
        BA13_Lwr: Classes.A,
        BA16_Upr: Classes.BII,
        BA16_Lwr: Classes.A,
        BA17_Upr: Classes.BII,
        BA17_Lwr: Classes.A,
        BB00_Upr: Classes.B,
        BB00_Lwr: Classes.B,
        BB01_Upr: Classes.B,
        BB01_Lwr: Classes.B,
        BB17_Upr: Classes.B,
        BB17_Lwr: Classes.B,
        BB02_Upr: Classes.B,
        BB02_Lwr: Classes.B,
        BB03_Upr: Classes.B,
        BB03_Lwr: Classes.B,
        BB11_Upr: Classes.B,
        BB11_Lwr: Classes.B,
        BB16_Upr: Classes.B,
        BB16_Lwr: Classes.B,
        BB04_Upr: Classes.B,
        BB04_Lwr: Classes.BII,
        BB05_Upr: Classes.B,
        BB05_Lwr: Classes.BII,
        BB07_Upr: Classes.BII,
        BB07_Lwr: Classes.BII,
        BB08_Upr: Classes.BII,
        BB08_Lwr: Classes.BII,
        BB10_Upr: Classes.miB,
        BB10_Lwr: Classes.miB,
        BB12_Upr: Classes.miB,
        BB12_Lwr: Classes.miB,
        BB13_Upr: Classes.miB,
        BB13_Lwr: Classes.miB,
        BB14_Upr: Classes.miB,
        BB14_Lwr: Classes.miB,
        BB15_Upr: Classes.miB,
        BB15_Lwr: Classes.miB,
        BB20_Upr: Classes.miB,
        BB20_Lwr: Classes.miB,
        IC01_Upr: Classes.IC,
        IC01_Lwr: Classes.IC,
        IC02_Upr: Classes.IC,
        IC02_Lwr: Classes.IC,
        IC03_Upr: Classes.IC,
        IC03_Lwr: Classes.IC,
        IC04_Upr: Classes.IC,
        IC04_Lwr: Classes.IC,
        IC05_Upr: Classes.IC,
        IC05_Lwr: Classes.IC,
        IC06_Upr: Classes.IC,
        IC06_Lwr: Classes.IC,
        IC07_Upr: Classes.IC,
        IC07_Lwr: Classes.IC,
        OP01_Upr: Classes.OPN,
        OP01_Lwr: Classes.OPN,
        OP02_Upr: Classes.OPN,
        OP02_Lwr: Classes.OPN,
        OP03_Upr: Classes.OPN,
        OP03_Lwr: Classes.OPN,
        OP04_Upr: Classes.OPN,
        OP04_Lwr: Classes.OPN,
        OP05_Upr: Classes.OPN,
        OP05_Lwr: Classes.OPN,
        OP06_Upr: Classes.OPN,
        OP06_Lwr: Classes.OPN,
        OP07_Upr: Classes.OPN,
        OP07_Lwr: Classes.OPN,
        OP08_Upr: Classes.OPN,
        OP08_Lwr: Classes.OPN,
        OP09_Upr: Classes.OPN,
        OP09_Lwr: Classes.OPN,
        OP10_Upr: Classes.OPN,
        OP10_Lwr: Classes.OPN,
        OP11_Upr: Classes.OPN,
        OP11_Lwr: Classes.OPN,
        OP12_Upr: Classes.OPN,
        OP12_Lwr: Classes.OPN,
        OP13_Upr: Classes.OPN,
        OP13_Lwr: Classes.OPN,
        OP14_Upr: Classes.OPN,
        OP14_Lwr: Classes.OPN,
        OP15_Upr: Classes.OPN,
        OP15_Lwr: Classes.OPN,
        OP16_Upr: Classes.OPN,
        OP16_Lwr: Classes.OPN,
        OP17_Upr: Classes.OPN,
        OP17_Lwr: Classes.OPN,
        OP18_Upr: Classes.OPN,
        OP18_Lwr: Classes.OPN,
        OP19_Upr: Classes.OPN,
        OP19_Lwr: Classes.OPN,
        OP20_Upr: Classes.OPN,
        OP20_Lwr: Classes.OPN,
        OP21_Upr: Classes.OPN,
        OP21_Lwr: Classes.OPN,
        OP22_Upr: Classes.OPN,
        OP22_Lwr: Classes.OPN,
        OP23_Upr: Classes.OPN,
        OP23_Lwr: Classes.OPN,
        OP24_Upr: Classes.OPN,
        OP24_Lwr: Classes.OPN,
        OP25_Upr: Classes.OPN,
        OP25_Lwr: Classes.OPN,
        OP26_Upr: Classes.OPN,
        OP26_Lwr: Classes.OPN,
        OP27_Upr: Classes.OPN,
        OP27_Lwr: Classes.OPN,
        OP28_Upr: Classes.OPN,
        OP28_Lwr: Classes.OPN,
        OP29_Upr: Classes.OPN,
        OP29_Lwr: Classes.OPN,
        OP30_Upr: Classes.OPN,
        OP30_Lwr: Classes.OPN,
        OP31_Upr: Classes.OPN,
        OP31_Lwr: Classes.OPN,
        OPS1_Upr: Classes.OPN,
        OPS1_Lwr: Classes.OPN,
        OP1S_Upr: Classes.OPN,
        OP1S_Lwr: Classes.OPN,
        AAS1_Upr: Classes.SYN,
        AAS1_Lwr: Classes.A,
        AB1S_Upr: Classes.A,
        AB1S_Lwr: Classes.SYN,
        AB2S_Upr: Classes.A,
        AB2S_Lwr: Classes.SYN,
        BB1S_Upr: Classes.B,
        BB1S_Lwr: Classes.SYN,
        BB2S_Upr: Classes.B,
        BB2S_Lwr: Classes.SYN,
        BBS1_Upr: Classes.SYN,
        BBS1_Lwr: Classes.B,
        ZZ01_Upr: Classes.Z,
        ZZ01_Lwr: Classes.Z,
        ZZ02_Upr: Classes.Z,
        ZZ02_Lwr: Classes.Z,
        ZZ1S_Upr: Classes.Z,
        ZZ1S_Lwr: Classes.SYN,
        ZZ2S_Upr: Classes.Z,
        ZZ2S_Lwr: Classes.SYN,
        ZZS1_Upr: Classes.SYN,
        ZZS1_Lwr: Classes.Z,
        ZZS2_Upr: Classes.SYN,
        ZZS2_Lwr: Classes.Z,
    };
    export type Conformers = typeof Conformers;
}
