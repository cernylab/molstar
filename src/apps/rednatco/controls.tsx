import React from 'react';
import { numDecimals, stof } from './util';

const Zero = '0'.charCodeAt(0);
const Nine = '9'.charCodeAt(0);
const Minus = '-'.charCodeAt(0);
const Period = '.'.charCodeAt(0);

function maybeNumeric(s: string) {
    for (let idx = 0; idx < s.length; idx++) {
        const cc = s.charCodeAt(idx);
        if (!((cc >= Zero && cc <= Nine) || cc === Minus || cc === Period))
            return false;
    }

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

export class PushButton extends React.Component<{ text: string, enabled: boolean, onClick: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton ${this.props.enabled ? '' : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClick() : {}}
            >
                <div className={`${this.props.enabled ? 'rmsp-pushbutton-text' : 'rmsp-pushbutton-text-disabled'}`}>{this.props.text}</div>
            </div>
        );
    }
}

export class ToggleButton extends React.Component<{ text: string, enabled: boolean, switchedOn: boolean, onClick: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton ${this.props.enabled ? (this.props.switchedOn ? 'rmsp-togglebutton-switched-on' : 'rmsp-togglebutton-switched-off') : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClick() : {}}
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
            displayedValue: this.props.formatter
                ? this.props.formatter(this.props.value.toString())
                : this.props.value.toString(),
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
            this.props.onChange(n);
    }

    private increase() {
        const n = stof(this.state.displayedValue);
        if (n === undefined)
            return;
        const nv = n + this.props.step;
        if (nv >= this.props.min)
            this.props.onChange(n);
    }

    private handleChange(value: string) {
        if (this.props.maxNumDecimals !== undefined && numDecimals(value) > this.props.maxNumDecimals)
            return;

        const n = stof(value);

        if (
            n !== undefined &&
            n !== this.props.value &&
            (this.props.min <= n && n <= this.props.max) &&
            value[value.length - 1] !== '.'
        ) {
            this.props.onChange(n);
        } else {
            if (maybeNumeric(value))
                this.setState({ ...this.state, displayedValue: value });
        }
    }

    componentDidUpdate(prevProps: SpinBox.Props) {
        if (this.props !== prevProps) {
            const displayedValue = this.props.formatter
                ? this.props.formatter(this.props.value.toString())
                : this.props.value.toString();
            this.setState({ ...this.state, displayedValue });
        }
    }

    render() {
        return (
            <div className='rmsp-spinbox-container'>
                <input
                    type='text'
                    className={this.props.disabled ? this.clsDisabled() : this.clsEnabled()}
                    value={this.state.displayedValue}
                    onChange={evt => this.handleChange(evt.currentTarget.value)}
                    onWheel={evt => {
                        evt.stopPropagation();
                        const n = stof(this.state.displayedValue);
                        if (n === undefined)
                            return;
                        if (evt.deltaY < 0) {
                            const nv = n + this.props.step;
                            if (nv <= this.props.max)
                                this.props.onChange(nv);
                        } else if (evt.deltaY > 0) {
                            const nv = n - this.props.step;
                            if (nv >= this.props.min)
                                this.props.onChange(nv);
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
        (v: string): string;
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
        formatter?: Formatter;
        maxNumDecimals?: number;
    }
}
