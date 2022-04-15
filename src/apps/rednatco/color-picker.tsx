/**
 * Copyright (c) 2018-2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Lada Biedermannová <Lada.Biedermannova@ibt.cas.cz>
 * @author Jiří Černý <jiri.cerny@ibt.cas.cz>
 * @author Michal Malý <michal.maly@ibt.cas.cz>
 * @author Bohdan Schneider <Bohdan.Schneider@ibt.cas.cz>
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { Colors } from './colors';
import { PushButton, SpinBox } from './controls';
import { parseInt as parseIntMS } from '../../mol-io/reader/common/text/number-parser';
import './assets/imgs/triangle-down.svg';
import './assets/imgs/triangle-up.svg';

const PALETTE_CURSOR_HALFSIZE = 10;
const VALUE_CURSOR_THICKNESS = 3;

const MIN_RGB = 0;
const MAX_RGB = 255;
const MIN_HUE = 0;
const MAX_HUE = 359;
const MIN_SATVAL = 0;
const MAX_SATVAL = 100;

function isRgbVal(v: number) {
    if (isNaN(v))
        return false;
    return v >= MIN_RGB && v <= MAX_RGB;
}

function isHueVal(v: number) {
    if (isNaN(v))
        return false;
    return v >= MIN_HUE && v <= MAX_HUE;
}

function isSatValVal(v: number) {
    if (isNaN(v))
        return false;
    return v >= MIN_SATVAL && v <= MAX_SATVAL;
}

function stoi(s: string) {
    return parseIntMS(s, 0, s.length);
}

interface State {
    h: number;
    s: number;
    v: number;
    restoreOnCancel: boolean;

    hIn: string;
    sIn: string;
    vIn: string;
    rIn: string;
    gIn: string;
    bIn: string;
}

export class ColorPicker extends React.Component<ColorPicker.Props, State> {
    private paletteRef: React.RefObject<HTMLCanvasElement>;
    private valueColumnRef: React.RefObject<HTMLCanvasElement>;
    private selfRef: React.RefObject<HTMLDivElement>;
    private mouseListenerAttached: boolean;
    private touchListenerAttached: boolean;
    private lastPaletteX: number;
    private lastPaletteY: number;
    private lastValueY: number;

    constructor(props: ColorPicker.Props) {
        super(props);

        this.paletteRef = React.createRef();
        this.valueColumnRef = React.createRef();
        this.selfRef = React.createRef();
        this.mouseListenerAttached = false;
        this.touchListenerAttached = false;
        this.lastPaletteX = 0;
        this.lastPaletteY = 0;
        this.lastValueY = 0;

        const { h, s, v } = Colors.colorToHsv(this.props.initialColor);
        const { r, g, b } = Colors.colorToRgb(this.props.initialColor);
        this.state = {
            h: Math.round(h),
            s,
            v,
            restoreOnCancel: false,
            hIn: h.toString(),
            sIn: v.toString(),
            vIn: s.toString(),
            rIn: r.toString(),
            gIn: g.toString(),
            bIn: b.toString(),
        };
    }

    private calcLeft() {
        const self = this.selfRef.current;
        if (!self)
            return this.props.left;

        const bw = document.body.clientWidth;
        const right = self.offsetLeft + self.clientWidth;
        const overhang = right - bw;
        if (overhang > 0)
            return bw - self.clientWidth - 25;
        return self.offsetLeft;
    }

    private calcTop() {
        const self = this.selfRef.current;
        if (!self)
            return this.props.top;

        const bh = document.body.clientHeight;
        const bottom = self.offsetTop + self.clientHeight;
        const overhang = bottom - bh;

        if (overhang > 0)
            return bh - self.clientHeight - 25;
        return self.offsetTop;
    }

    private changeColorFromPalette(ex: number, ey: number) {
        const tainer = this.selfRef.current!;
        const palette = this.paletteRef.current!;
        let x = ex - tainer.offsetLeft - tainer.clientLeft - palette.offsetLeft - palette.clientLeft;
        let y = ey - tainer.offsetTop - tainer.clientTop - palette.offsetTop - palette.clientTop;

        if (x < 0)
            x = 0;
        else if (x >= palette.width)
            x = palette.width - 1;
        if (y < 0)
            y = 0;
        else if (y >= palette.height)
            y = palette.height - 1;

        const { h, s } = this.paletteCoordsToHueSat(x, y);
        this.updateColorHsv({ h, s, v: this.state.v });
    }

    private changeColorFromValue(ey: number) {
        const tainer = this.selfRef.current!;
        const valCol = this.valueColumnRef.current!;
        let y = ey - tainer.offsetTop - tainer.clientTop - valCol.offsetTop - valCol.clientTop;
        if (y < 0)
            y = 0;
        else if (y >= valCol.height)
            y = valCol.height - 1;
        const v = this.valueColumnCoordToVal(y);
        this.updateColorHsv({ h: this.state.h, s: this.state.s, v });
    }

    private dispose() {
        document.body.removeChild(this.props.parentElement);
    }

    private drawPalette() {
        if (!this.paletteRef.current)
            return;

        const canvas = this.paletteRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;

        this.drawPalleteInternal(ctx, canvas.width, canvas.height);
        this.drawPaletteCursorInternal(ctx, canvas.width, canvas.height, this.state.h, this.state.s);
    }

    private drawPalleteInternal(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const hueStep = 360 / width;
        const satStep = 1.0 / height;

        ctx.clearRect(0, 0, width, height);

        for (let x = 0; x < width; x++) {
            const hue = hueStep * x;
            for (let y = 0; y < height; y++) {
                const sat = 1.0 - satStep * y;

                ctx.fillStyle = Colors.hsvToHexString(hue, sat, 1.0);
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    private drawPaletteCursor(hue: number, sat: number) {
        if (!this.paletteRef.current)
            return;

        const canvas = this.paletteRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;

        this.drawPaletteCursorInternal(ctx, canvas.width, canvas.height, hue, sat);
    }

    private drawPaletteCursorInternal(ctx: CanvasRenderingContext2D, width: number, height: number, hue: number, sat: number) {
        const hueStep = 360 / width;
        const satStep = 1.0 / height;
        const fullSize = Math.floor(PALETTE_CURSOR_HALFSIZE * 2);

        let fx = Math.floor(this.lastPaletteX - PALETTE_CURSOR_HALFSIZE - 1);
        if (fx < 0) fx = 0;
        let tx = fx + fullSize + 2;
        if (tx > width) tx = width;

        let fy = Math.floor(this.lastPaletteY - PALETTE_CURSOR_HALFSIZE - 1);
        if (fy < 0) fy = 0;
        let ty = fy + fullSize + 2;
        if (ty > height) ty = height;

        for (let x = fx; x < tx; x++) {
            const hue = hueStep * x;
            for (let y = fy; y < ty; y++) {
                const sat = 1.0 - satStep * y;

                ctx.fillStyle = Colors.hsvToHexString(hue, sat, 1.0);
                ctx.fillRect(x, y, 1, 1);
            }
        }

        const cx = Math.round(hue / hueStep);
        const cy = Math.round((1.0 - sat) / satStep);

        ctx.beginPath();
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.lineWidth = 2;
        ctx.moveTo(cx - PALETTE_CURSOR_HALFSIZE, cy);
        ctx.lineTo(cx + PALETTE_CURSOR_HALFSIZE, cy);
        ctx.moveTo(cx, cy - PALETTE_CURSOR_HALFSIZE);
        ctx.lineTo(cx, cy + PALETTE_CURSOR_HALFSIZE);
        ctx.closePath();
        ctx.stroke();

        this.lastPaletteX = cx;
        this.lastPaletteY = cy;
    }

    private drawValueColumn() {
        if (!this.valueColumnRef.current)
            return;

        const canvas = this.valueColumnRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;

        this.drawValueColumnInternal(ctx, canvas.width, canvas.height);
        this.drawValueColumnCursorInternal(ctx, canvas.width, canvas.height, this.state.v);
    }

    private drawValueColumnInternal(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const valStep = 1.0 / height;

        for (let y = 0; y < height; y++) {
            const cv = 1.0 - y * valStep;

            ctx.fillStyle = Colors.hsvToHexString(this.state.h, this.state.s, cv);
            ctx.fillRect(0, y, width, 1);
        }
    }

    private drawValueColumnCursor(val: number) {
        if (!this.valueColumnRef.current)
            return;

        const canvas = this.valueColumnRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;

        this.drawValueColumnCursorInternal(ctx, canvas.width, canvas.height, val);
    }

    private drawValueColumnCursorInternal(ctx: CanvasRenderingContext2D, width: number, height: number, val: number) {
        const valStep = 1.0 / height;

        let fy = Math.floor(this.lastValueY - 1);
        if (fy < 0) fy = 0;
        let ty = Math.floor(fy + VALUE_CURSOR_THICKNESS + 2);
        if (ty > height)
            ty = height;

        for (let y = fy; y < ty; y++) {
            const cv = 1.0 - y * valStep;

            ctx.fillStyle = Colors.hsvToHexString(this.state.h, this.state.s, cv);
            ctx.fillRect(0, y, width, 1);
        }

        const y = Math.round((1.0 - val) / valStep);
        const halfWidth = Math.round(width / 2);

        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.fillRect(0, y, halfWidth, VALUE_CURSOR_THICKNESS);
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fillRect(halfWidth, y, width - halfWidth, VALUE_CURSOR_THICKNESS);

        this.lastValueY = y;
    }

    private paletteCoordsToHueSat(x: number, y: number) {
        const palette = this.paletteRef.current!;

        const h = 360 * x / palette.width;
        const s = 1.0 - 1.0 * y / palette.height;

        return { h, s };
    }

    private onGlobalMouseMovedValue = (evt: MouseEvent) => {
        if ((evt.buttons & 1) === 0) {
            window.removeEventListener('mousemove', this.onGlobalMouseMovedValue);
            this.mouseListenerAttached = false;
            return;
        }

        this.changeColorFromValue(evt.pageY);
    };

    private onGlobalMouseMovedPalette = (evt: MouseEvent) => {
        if ((evt.buttons & 1) === 0) {
            window.removeEventListener('mousemove', this.onGlobalMouseMovedPalette);
            this.mouseListenerAttached = false;
            return;
        }

        this.changeColorFromPalette(evt.pageX, evt.pageY);
    };

    private onGlobalTouchMovedPalette = (evt: TouchEvent) => {
        if (evt.touches.length !== 0)
            this.changeColorFromPalette(evt.touches[0].pageX, evt.touches[0].pageY);
    };

    private updateColorHsv(hsv: { h: number, s: number, v: number }) {
        const rgb = Colors.hsv2rgb(hsv.h, hsv.s, hsv.v);
        this.updateColor(rgb, hsv);
    }

    private updateColorRgb(rgb: { r: number, g: number, b: number }) {
        const hsv = Colors.rgb2hsv(rgb.r, rgb.g, rgb.b);
        this.updateColor(rgb, hsv);
    }

    private updateColor(rgb: { r: number, g: number, b: number }, hsv: { h: number, s: number, v: number }) {
        let update: Partial<State> = { ...hsv };
        if (this.state.rIn === '')
            update = { ...update, rIn: rgb.r.toString() };
        if (this.state.gIn === '')
            update = { ...update, gIn: rgb.g.toString() };
        if (this.state.bIn === '')
            update = { ...update, bIn: rgb.b.toString() };
        if (this.state.hIn === '')
            update = { ...update, hIn: hsv.h.toString() };
        if (this.state.sIn === '')
            update = { ...update, sIn: hsv.s.toString() };
        if (this.state.vIn === '')
            update = { ...update, vIn: hsv.v.toString() };

        this.setState({
            ...this.state,
            ...update,
        });
    }

    private onGlobalTouchMovedValue = (evt: TouchEvent) => {
        if (evt.touches.length !== 0)
            this.changeColorFromValue(evt.touches[0].pageY);
    };

    private valueColumnCoordToVal(y: number) {
        const valCol = this.valueColumnRef.current!;

        return 1.0 - 1.0 * y / valCol.height;
    }

    componentDidMount() {
        this.drawPalette();
        this.drawValueColumn();

        this.forceUpdate();
    }

    componentDidUpdate(_prevProps: ColorPicker.Props, prevState: State) {
        if (this.state.h !== prevState.h || this.state.s !== prevState.s) {
            this.drawPaletteCursor(this.state.h, this.state.s);
            this.drawValueColumn();
        }
        if (this.state.v !== prevState.v) {
            this.drawValueColumnCursor(this.state.v);
        }
    }

    componentWillUnmount() {
        window.removeEventListener('mousemove', this.onGlobalMouseMovedValue);
        window.removeEventListener('mousemove', this.onGlobalMouseMovedPalette);
        window.removeEventListener('touchmove', this.onGlobalTouchMovedValue);
        window.removeEventListener('touchmove', this.onGlobalTouchMovedPalette);
    }

    render() {
        return (
            <div
                ref={this.selfRef}
                style={{
                    background: 'white',
                    border: '0.15em solid #ccc',
                    boxShadow: '0 0 0.3em 0 rgba(0, 0, 0, 0.5)',
                    left: this.calcLeft(),
                    padding: '0.5em',
                    position: 'absolute',
                    top: this.calcTop(),
                    zIndex: 99,
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridColumnGap: '0.5em',
                        gridTemplateColumns: 'auto auto',
                        marginBottom: '0.5em',
                    }}
                >
                    <canvas
                        width={360}
                        height={256}
                        ref={this.paletteRef}
                        onMouseDown={evt => {
                            if ((evt.buttons & 1) === 0 || this.mouseListenerAttached)
                                return;
                            this.changeColorFromPalette(evt.pageX, evt.pageY);
                            this.mouseListenerAttached = true;
                            window.addEventListener('mousemove', this.onGlobalMouseMovedPalette);
                        }}
                        onMouseUp={evt => {
                            if (evt.buttons & 1) {
                                window.removeEventListener('mousemove', this.onGlobalMouseMovedPalette);
                                this.mouseListenerAttached = false;
                            }
                        }}
                        onTouchStart={evt => {
                            if (this.touchListenerAttached)
                                return;

                            window.addEventListener('touchmove', this.onGlobalTouchMovedPalette);
                            this.touchListenerAttached = true;
                            if (evt.touches.length !== 0)
                                this.changeColorFromPalette(evt.touches[0].pageX, evt.touches[0].pageY);

                        }}
                        onTouchEnd={_evt => {
                            window.removeEventListener('touchmove', this.onGlobalTouchMovedPalette);
                            this.touchListenerAttached = false;
                        }}
                    />
                    <canvas
                        width={30}
                        height={256}
                        ref={this.valueColumnRef}
                        style={{
                            height: '100%',
                            width: '1em',
                        }}
                        onMouseDown={evt => {
                            if ((evt.buttons & 1) === 0 || this.mouseListenerAttached)
                                return;
                            this.changeColorFromValue(evt.pageY);
                            this.mouseListenerAttached = true;
                            window.addEventListener('mousemove', this.onGlobalMouseMovedValue);
                        }}
                        onMouseUp={evt => {
                            if (evt.buttons & 1) {
                                window.removeEventListener('mousemove', this.onGlobalMouseMovedValue);
                                this.mouseListenerAttached = false;
                            }
                        }}
                        onTouchStart={evt => {
                            if (this.touchListenerAttached)
                                return;

                            window.addEventListener('touchmove', this.onGlobalTouchMovedValue);
                            this.touchListenerAttached = true;
                            if (evt.touches.length !== 0)
                                this.changeColorFromValue(evt.touches[0].pageY);

                        }}
                        onTouchEnd={_evt => {
                            window.removeEventListener('touchmove', this.onGlobalTouchMovedValue);
                            this.touchListenerAttached = false;
                        }}

                        onWheel={evt => {
                            if (evt.deltaY === 0)
                                return;
                            let v = this.state.v - 0.01 * Math.sign(evt.deltaY);
                            if (v < 0)
                                v = 0;
                            else if (v > 1)
                                v = 1;
                            this.setState({ ...this.state, v });
                        }}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        marginBottom: '0.5em',
                    }}
                >
                    <div
                        style={{
                            background: Colors.colorToHexString(this.props.initialColor),
                            flex: 1,
                            height: '2em',
                        }}
                    />
                    <div
                        style={{
                            background: Colors.colorToHexString(Colors.colorFromHsv(this.state.h, this.state.s, this.state.v)),
                            flex: 1,
                            height: '2em',
                        }}
                    />
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridColumnGap: '0.5em',
                        gridTemplateColumns: 'auto 4em auto 4em auto 4em',
                        marginBottom: '0.5em',
                    }}
                >
                    <div>R</div>
                    <SpinBox
                        min={MIN_RGB}
                        max={MAX_RGB}
                        step={1}
                        value={this.state.rIn === '' ? null : Math.round(Colors.hsv2rgb(this.state.h, this.state.s, this.state.v).r)}
                        onChange={rIn => {
                            if (rIn === '')
                                this.setState({ ...this.state, rIn });
                            else {
                                const r = stoi(rIn);
                                if (!isRgbVal(r))
                                    return;

                                const { g, b } = Colors.hsv2rgb(this.state.h, this.state.s, this.state.v);
                                this.updateColorRgb({ r, g, b });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                    <div>G</div>
                    <SpinBox
                        min={MIN_RGB}
                        max={MAX_RGB}
                        step={1}
                        value={this.state.gIn === '' ? null : Math.round(Colors.hsv2rgb(this.state.h, this.state.s, this.state.v).g)}
                        onChange={gIn => {
                            if (gIn === '')
                                this.setState({ ...this.state, gIn });
                            else {
                                const g = stoi(gIn);
                                if (!isRgbVal(g))
                                    return;

                                const { r, b } = Colors.hsv2rgb(this.state.h, this.state.s, this.state.v);
                                this.updateColorRgb({ r, g, b });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                    <div>B</div>
                    <SpinBox
                        min={MIN_RGB}
                        max={MAX_RGB}
                        step={1}
                        value={this.state.bIn === '' ? null : Math.round(Colors.hsv2rgb(this.state.h, this.state.s, this.state.v).b)}
                        onChange={bIn => {
                            if (bIn === '')
                                this.setState({ ...this.state, bIn });
                            else {
                                const b = stoi(bIn);
                                if (!isRgbVal(b))
                                    return;

                                const { r, g } = Colors.hsv2rgb(this.state.h, this.state.s, this.state.v);
                                this.updateColorRgb({ r, g, b });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridColumnGap: '0.5em',
                        gridTemplateColumns: 'auto 4em auto 4em auto 4em',
                        marginBottom: '0.5em',
                    }}
                >
                    <div>H</div>
                    <SpinBox
                        min={MIN_HUE}
                        max={MAX_HUE}
                        step={1}
                        value={this.state.hIn === '' ? null : Math.round(this.state.h)}
                        onChange={hIn => {
                            if (hIn === '')
                                this.setState({ ...this.state, hIn });
                            else {
                                const h = stoi(hIn);
                                if (!isHueVal(h))
                                    return;

                                this.updateColorHsv({ h, s: this.state.s, v: this.state.v });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                    <div>S</div>
                    <SpinBox
                        min={MIN_SATVAL}
                        max={MAX_SATVAL}
                        step={1}
                        value={this.state.sIn === '' ? null : Math.round(this.state.s * 100)}
                        onChange={sIn => {
                            if (sIn === '')
                                this.setState({ ...this.state, sIn });
                            else {
                                const s = stoi(sIn);
                                if (!isSatValVal(s))
                                    return;

                                this.updateColorHsv({ h: this.state.h, s: s / 100, v: this.state.v });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                    <div>V</div>
                    <SpinBox
                        min={MIN_SATVAL}
                        max={MAX_SATVAL}
                        step={1}
                        value={this.state.vIn === '' ? null : Math.round(this.state.v * 100)}
                        onChange={vIn => {
                            if (vIn === '')
                                this.setState({ ...this.state, vIn });
                            else {
                                const v = stoi(vIn);
                                if (!isSatValVal(v))
                                    return;

                                this.updateColorHsv({ h: this.state.h, s: this.state.s, v: v / 100 });
                            }
                        }}
                        pathPrefix={this.props.pathPrefix}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: '0.5em',
                    }}
                >
                    <PushButton
                        text='OK'
                        onClick={() => {
                            this.props.onColorPicked(Colors.colorFromHsv(this.state.h, this.state.s, this.state.v));
                            this.dispose();
                        }}
                        enabled={true}
                    />
                    <PushButton
                        text='Preview'
                        onClick={() => {
                            this.props.onColorPicked(Colors.colorFromHsv(this.state.h, this.state.s, this.state.v));
                            this.setState({ ...this.state, restoreOnCancel: true });
                        }}
                        enabled={true}
                    />
                    <PushButton
                        text='Cancel'
                        onClick={() => {
                            if (this.state.restoreOnCancel)
                                this.props.onColorPicked(this.props.initialColor);
                            this.dispose();
                        }}
                        enabled={true}
                    />
                </div>
            </div>
        );
    }
}

export namespace ColorPicker {
    export interface OnColorPicked {
        (color: number): void;
    }

    export interface Props {
        initialColor: number;
        left: number;
        top: number;
        onColorPicked: OnColorPicked;
        parentElement: HTMLElement;
        pathPrefix: string;
    }

    export function create<T>(evt: React.MouseEvent<T, MouseEvent>, initialColor: number, handler: OnColorPicked, pathPrefix = '') {
        const tainer = document.createElement('div');
        tainer.classList.add('rmsp-color-picker-nest');
        document.body.appendChild(tainer);

        ReactDOM.render(
            <ColorPicker
                initialColor={initialColor}
                left={evt.clientX}
                top={evt.clientY}
                onColorPicked={handler}
                parentElement={tainer}
                pathPrefix={pathPrefix}
            />,
            tainer
        );
    }
}
