import React from 'react';

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

export class SpinBox extends React.Component<SpinBox.Props> {
    private clsDisabled() {
        return this.props.classNameDisabled ?? 'rmsp-spinbox-input-disabled';
    }

    private clsEnabled() {
        return this.props.className ?? 'rmsp-spinbox-input';
    }

    private decrease() {
        if (this.props.value === null)
            return;
        const nv = this.props.value - this.props.step;
        if (nv >= this.props.min)
            this.props.onChange(nv.toString());
    }

    private increase() {
        if (this.props.value === null)
            return;
        const nv = this.props.value + this.props.step;
        if (nv >= this.props.min)
            this.props.onChange(nv.toString());
    }

    render() {
        return (
            <div className='rmsp-spinbox-container'>
                <input
                    type='text'
                    className={this.props.disabled ? this.clsDisabled() : this.clsEnabled()}
                    value={this.props.formatter ? this.props.formatter(this.props.value) : this.props.value?.toString() ?? ''}
                    onChange={evt => this.props.onChange(evt.currentTarget.value)}
                    onWheel={evt => {
                        evt.stopPropagation();
                        if (this.props.value === null)
                            return;
                        if (evt.deltaY < 0) {
                            const nv = this.props.value + this.props.step;
                            if (nv <= this.props.max)
                                this.props.onChange(nv.toString());
                        } else if (evt.deltaY > 0) {
                            const nv = this.props.value - this.props.step;
                            if (nv >= this.props.min)
                                this.props.onChange(nv.toString());
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
        (v: number|null): string;
    }

    export interface OnChange {
        (newValue: string): void;
    }

    export interface Props {
        value: number|null;
        onChange: OnChange;
        min: number;
        max: number;
        step: number;
        pathPrefix: string;
        disabled?: boolean;
        className?: string;
        classNameDisabled?: string;
        formatter?: Formatter;
    }
}
