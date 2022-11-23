import React from 'react';
import { fuzzyCmp, luminance, numDecimals, reduceDecimals, stof } from './util';
import { Color } from '../../mol-util/color';

const Zero = '0'.charCodeAt(0);
const Nine = '9'.charCodeAt(0);
const Minus = '-'.charCodeAt(0);
const Period = '.'.charCodeAt(0);

function isAllowedNumericInput(s: string, maxNumDecimals?: number) {
    let havePeriod = false;
    for (let idx = 0; idx < s.length; idx++) {
        const cc = s.charCodeAt(idx);
        if (cc === Period) {
            if (havePeriod)
                return false;
            else
                havePeriod = true;
        } else if (cc === Minus) {
            if (idx > 0)
                return false;
        } else if (!(cc >= Zero && cc <= Nine))
            return false;
    }

    if (maxNumDecimals !== undefined)
        return numDecimals(s) <= maxNumDecimals;
    return true;
}

export class CollapsibleVertical extends React.Component<CollapsibleVertical.Props, { collapsed: boolean }> {
    constructor(props: CollapsibleVertical.Props) {
        super(props);

        this.state = {
            collapsed: true,
        };
    }

    render() {
        return (
            <div className='rmsp-collapsible-vertical'>
                <div
                    className='rmsp-collapsible-vertical-caption'
                    onClick={() => this.setState({ ...this.state, collapsed: !this.state.collapsed })}
                >
                    {this.props.caption}
                </div>
                {this.state.collapsed ? undefined : this.props.children}
            </div>
        );
    }
}
export namespace CollapsibleVertical {
    export interface Props {
        caption: string;
        children?: React.ReactNode;
    }
}

export class ColorBox extends React.Component<{ caption: string, color: Color }> {
    render() {
        const lum = luminance(this.props.color);
        return (
            <div
                className='rmsp-color-box'
                style={{ backgroundColor: Color.toStyle(this.props.color) }}
            >
                <span
                    style={{
                        color: lum > 0.6 ? 'black' : 'white',
                        fontWeight: 'bold',
                        margin: '0.15em',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {this.props.caption}
                </span>
            </div>
        );
    }
}

export class IconButton extends React.Component<{ img: string, enabled: boolean, onClicked: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-icon-button ${this.props.enabled ? '' : 'rmsp-icon-button-disabled'}`}
                onClick={() => this.props.onClicked()}
            >
                <img
                    className='rmsp-icon-button-icon'
                    src={this.props.img}
                />
            </div>
        );
    }
}

export class PushButton extends React.Component<{ text: string, enabled: boolean, onClicked: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton ${this.props.enabled ? '' : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClicked() : {}}
            >
                <div className={`${this.props.enabled ? 'rmsp-pushbutton-text' : 'rmsp-pushbutton-text-disabled'}`}>{this.props.text}</div>
            </div>
        );
    }
}

export class ToggleButton extends React.Component<{ text: string, enabled: boolean, switchedOn: boolean, onClicked: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton rmsp-togglebutton ${this.props.enabled ? (this.props.switchedOn ? 'rmsp-togglebutton-switched-on' : 'rmsp-togglebutton-switched-off') : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClicked() : {}}
            >
                <div className={`${this.props.enabled ? 'rmsp-pushbutton-text' : 'rmsp-pushbutton-text-disabled'}`}>{this.props.text}</div>
            </div>
        );
    }
}

export class RangeSlider extends React.Component<RangeSlider.Props> {
    render() {
        return (
            <input
                className='rmsp-range-slider'
                type='range'
                value={this.props.value ? this.props.value : 0}
                min={this.props.min}
                max={this.props.max}
                step={this.props.step}
                onChange={evt => {
                    const n = stof(evt.currentTarget.value);
                    if (n !== undefined)
                        this.props.onChange(n);
                }}
            />
        );
    }
}
export namespace RangeSlider {
    export interface Props {
        min: number;
        max: number;
        step: number;
        value: number|null;
        onChange: (n: number|null) => void;
    }
}

interface SpinBoxState {
    displayedValue: string
}
export class SpinBox extends React.Component<SpinBox.Props, SpinBoxState> {
    constructor(props: SpinBox.Props) {
        super(props);

        this.state = {
            displayedValue: this.formatValue(this.props.value),
        };
    }

    private clsDisabled() {
        return this.props.classNameDisabled ?? 'rmsp-spinbox-input-disabled';
    }

    private clsEnabled() {
        return this.props.className ?? 'rmsp-spinbox-input';
    }

    private decrease() {
        const n = stof(this.state.displayedValue);
        if (n === undefined)
            return;
        const nv = n - this.props.step;
        if (nv >= this.props.min)
            this.notifyChange(nv);
    }

    private formatValue(n: number, padToDecimals?: number) {
        if (this.props.maxNumDecimals !== undefined) {
            if (padToDecimals !== undefined) {
                const padded = n.toFixed(padToDecimals);
                if (fuzzyCmp(n, stof(padded)!))
                    return padded;
            }

            const fn = n.toFixed(this.props.maxNumDecimals);
            return reduceDecimals(fn);
        }
        return n.toString();
    }

    private increase() {
        const n = stof(this.state.displayedValue);
        if (n === undefined)
            return;
        const nv = n + this.props.step;
        if (nv <= this.props.max)
            this.notifyChange(nv);
    }

    private maybeNotifyUpdate(value: string) {
        if (this.props.maxNumDecimals !== undefined && numDecimals(value) > this.props.maxNumDecimals)
            return;

        const n = stof(value);

        if (
            n !== undefined &&
            !fuzzyCmp(n, this.props.value) &&
            (this.props.min <= n && n <= this.props.max)
        ) {
            this.notifyChange(n);
        }
    }

    private notifyChange(n: number) {
        if (this.props.maxNumDecimals !== undefined) {
            const Factor = Math.pow(10, this.props.maxNumDecimals);
            this.props.onChange(Math.round(n * Factor) / Factor);
        } else
            this.props.onChange(n);
    }

    componentDidUpdate(prevProps: SpinBox.Props, prevState: SpinBoxState) {
        if (this.props !== prevProps && this.props.value !== prevProps.value) {
            const padToDecimals = stof(this.state.displayedValue) !== undefined ? numDecimals(this.state.displayedValue) : void 0;
            const displayedValue = this.formatValue(this.props.value, padToDecimals);
            if (
                displayedValue !== this.state.displayedValue &&
                displayedValue !== this.state.displayedValue.substring(0, this.state.displayedValue.length - 1)
            )
                this.setState({ ...this.state, displayedValue });
        } else {
            if (this.state.displayedValue !== prevState.displayedValue)
                this.maybeNotifyUpdate(this.state.displayedValue);
        }
    }

    render() {
        return (
            <div className='rmsp-spinbox-container'>
                <input
                    type='text'
                    className={this.props.disabled ? this.clsDisabled() : this.clsEnabled()}
                    value={this.state.displayedValue}
                    onChange={evt => {
                        const v = evt.currentTarget.value;
                        if (isAllowedNumericInput(v, this.props.maxNumDecimals))
                            this.setState({ ...this.state, displayedValue: v });
                    }}
                    onWheel={evt => {
                        evt.stopPropagation();
                        const n = stof(this.state.displayedValue);
                        if (n === undefined)
                            return;
                        if (evt.deltaY < 0) {
                            const nv = n + this.props.step;
                            if (nv <= this.props.max)
                                this.notifyChange(nv);
                        } else if (evt.deltaY > 0) {
                            const nv = n - this.props.step;
                            if (nv >= this.props.min)
                                this.notifyChange(nv);
                        }
                    }}
                />
                <div className='rmsp-spinbox-buttons'>
                    <img
                        className='rmsp-spinbox-button'
                        src={`./${this.props.pathPrefix}imgs/triangle-up.svg`} onClick={() => this.increase()}
                    />
                    <img
                        className='rmsp-spinbox-button'
                        src={`./${this.props.pathPrefix}imgs/triangle-down.svg`} onClick={() => this.decrease()}
                    />
                </div>
            </div>
        );
    }
}
export namespace SpinBox {
    export interface Formatter {
        (v: number): string;
    }

    export interface OnChange {
        (newValue: number): void;
    }

    export interface Props {
        value: number;
        onChange: OnChange;
        min: number;
        max: number;
        step: number;
        pathPrefix: string;
        disabled?: boolean;
        className?: string;
        classNameDisabled?: string;
        maxNumDecimals?: number;
    }
}
