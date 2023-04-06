import React, { CSSProperties } from 'react';

type Orientation = 'horizontal' | 'vertical';

const StyleControls: Record<Orientation, CSSProperties> = {
    horizontal: {},
    vertical: {},
};
const StyleIconBar: Record<Orientation, CSSProperties> = {
    horizontal: { display: 'flex', flexDirection: 'row' },
    vertical: { display: 'flex', flexDirection: 'column' },
};
const StyleTainer: Record<Orientation, CSSProperties> = {
    horizontal: { display: 'flex', flexDirection: 'column' },
    vertical: { display: 'flex', flexDirection: 'row' },
};

type IconStatus = 'normal' | 'selected' | 'disabled';
const IconTainerClasses: Record<IconStatus, string> = {
    normal: 'rmsp-toolbar-icon-tainer',
    selected: 'rmsp-toolbar-icon-tainer rmsp-toolbar-icon-tainer-selected',
    disabled: 'rmsp-toolbar-icon-tainer-disabled',
};
const IconClasses: Record<IconStatus, string> = {
    normal: 'rmsp-toolbar-icon',
    selected: 'rmsp-toolbar-icon rmsp-toolbar-icon-selected',
    disabled: 'rmsp-toolbar-icon-disabled',
};
class Icon extends React.Component<{ img: string, status: 'normal' | 'selected' | 'disabled', onClicked: () => void }> {
    render() {
        return (
            <div
                className={IconTainerClasses[this.props.status]}
                style={{ display: 'flex', width: '2em', height: '2em' }}
                onClick={this.props.onClicked}
            >
                <img
                    className={IconClasses[this.props.status]}
                    style={{ flex: 1, objectFit: 'contain' }}
                    src={this.props.img}
                />
            </div>
        );
    }
}

interface State<ID extends string> {
    selected: ID | null;
}
export class ToolBar<ID extends string> extends React.Component<ToolBar.Props<ID>, State<ID>> {
    constructor(props: ToolBar.Props<ID>) {
        super(props);

        this.state = {
            selected: null,
        };
    }

    renderIconBar() {
        const icons = new Array<JSX.Element>();
        for (const blk of this.props.controlBlocks) {
            icons.push(
                <Icon
                    img={blk.icon}
                    status={blk.disabled
                        ? 'disabled'
                        : this.state.selected === blk.id
                            ? 'selected' : 'normal'
                    }
                    onClicked={!blk.disabled ? () => this.setState({ ...this.state, selected: this.state.selected === blk.id ? null : blk.id }) : () => {}}
                />
            );
        }

        return icons;
    }

    componentDidUpdate(prevProps: Readonly<ToolBar.Props<ID>>, prevState: Readonly<State<ID>>) {
        if (prevState.selected !== this.state.selected && this.props.onBlockChanged)
            this.props.onBlockChanged();
    }

    render() {
        return (
            <div className='rmsp-toolbar' style={ StyleTainer[this.props.orientation] }>
                <div style={ StyleIconBar[this.props.orientation] }>
                    {this.renderIconBar()}
                </div>
                {this.state.selected !== null
                    ? <div
                        className='rmsp-toolbar-control-block'
                        style={ StyleControls[this.props.orientation] }
                    >
                        {this.props.controlBlocks.find(x => x.id === this.state.selected)?.content}
                    </div>
                    : undefined
                }
            </div>
        );
    }
}

export namespace ToolBar {
    export type ControlBlock<ID extends string> = {
        id: ID;
        icon: string;
        content: React.ReactNode;
        disabled?: boolean;
    }

    export interface Props<ID extends string> {
        controlBlocks: ControlBlock<ID>[];
        orientation: Orientation;
        onBlockChanged?: () => void;
    }

    export function Specialize<ID extends string>() {
        return class _ extends ToolBar<ID> {};
    }
}

export class ToolBarContent extends React.Component<{ children: React.ReactNode | React.ReactNode[], style?: CSSProperties }> {
    render() {
        return (
            <div className='rmsp-toolbar-control-block-content' style={this.props.style}>
                {this.props.children}
            </div>
        );
    }
}
