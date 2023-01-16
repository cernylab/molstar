import React from 'react';
import { ReDNATCOMspApi as Api } from './api';
import { ColorPicker } from './color-picker';
import { ColorBox, RangeSlider, SpinBox, ToggleButton } from './controls';
import { DensityMapDisplay } from './index';
import { isoBounds, isoToFixed } from './util';
import { ReDNATCOMspViewer as Viewer } from './viewer';
import { Color } from '../../mol-util/color';

export class DensityMapControls extends React.Component<DensityMapControls.Props> {
    private colors(index: number, colors: DensityMapDisplay['colors']) {
        const elems = new Array<JSX.Element>();

        for (let idx = 0; idx < colors.length; idx++) {
            const c = colors[idx];
            const e =
                <div className='rmsp-control-item'
                    key={idx}
                    style={{ backgroundColor: Color.toHexString(c.color) }}
                    onClick={(evt) => {
                        ColorPicker.create(
                            evt,
                            c.color,
                            (color) => {
                                colors[idx] = { ...colors[idx], color: Color(color) },
                                this.props.changeColors(index, colors);
                            }
                        );
                    }}
                >
                    <ColorBox
                        caption={c.name}
                        color={c.color}
                    />
                </div>;
            elems.push(e);
        }

        return elems;
    }

    private controls(display: DensityMapDisplay[]) {
        const ctrls = new Array<JSX.Element>();

        for (let idx = 0; idx < display.length; idx++) {
            const isoRange = this.props.viewer.densityMapIsoRange(idx);
            const _isoBounds = isoRange ? isoBounds(isoRange.min, isoRange.max) : { min: 0, max: 0, step: 0 };

            const d = display[idx];
            const elem = (
                <React.Fragment key={idx}>
                    <div className='rmsp-control-section-caption'>
                        {this.mapName(d.kind)}
                    </div>
                    <div className='rmsp-control-line'>
                        <div className='rmsp-control-item'>
                            <ToggleButton
                                text='Wire'
                                switchedOn={d.representations.includes('wireframe')}
                                onClicked={() => this.props.toggleWireframe(idx)}
                                enabled={true}
                            />
                        </div>
                        <div className='rmsp-control-item'>
                            <ToggleButton
                                text='Solid'
                                switchedOn={d.representations.includes('solid')}
                                onClicked={() => this.props.toggleSolid(idx)}
                                enabled={true}
                            />
                        </div>
                        { this.colors(idx, d.colors) }
                    </div>

                    <div className='rmsp-control-section-caption'>
                        Iso:
                    </div>
                    <div className='rmsp-control-line'>
                        <div className='rmsp-control-item'>
                            <RangeSlider
                                min={_isoBounds.min}
                                max={_isoBounds.max}
                                step={_isoBounds.step}
                                value={isoToFixed(d.isoValue, _isoBounds.step)}
                                onChange={(v) => this.props.changeIso(idx, v!)}
                            />
                        </div>
                        <div className='rmsp-control-item-squished'>
                            <div style={{ display: 'grid', gridTemplateColumns: '4em 1fr' }}>
                                <SpinBox
                                    min={_isoBounds.min}
                                    max={_isoBounds.max}
                                    step={_isoBounds.step}
                                    maxNumDecimals={Math.log10(_isoBounds.step) >= 0 ? 0 : -Math.log10(_isoBounds.step)}
                                    value={isoToFixed(d.isoValue, _isoBounds.step)}
                                    onChange={(n) => this.props.changeIso(idx, n)}
                                    pathPrefix=''
                                />
                                <div />
                            </div>
                        </div>
                    </div>

                    <div className='rmsp-control-section-caption'>
                        Transp:
                    </div>
                    <div className='rmsp-control-line'>
                        <div className='rmsp-control-item'>
                            <RangeSlider
                                min={0}
                                max={100}
                                step={1}
                                value={(1.0 - d.alpha) * 100}
                                onChange={(n) => this.props.changeAlpha(idx, 1.0 - (n! / 100))}
                            />
                        </div>
                        <div className='rmsp-control-item-squished'>
                            <div style={{ display: 'grid', gridTemplateColumns: '4em 1fr' }}>
                                <SpinBox
                                    min={0}
                                    max={100}
                                    step={1}
                                    maxNumDecimals={0}
                                    value={(1.0 - d.alpha) * 100}
                                    onChange={(n) => this.props.changeAlpha(idx, 1.0 - (n / 100))}
                                    pathPrefix=''
                                />
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            );
            ctrls.push(elem);
        }

        return ctrls;
    }

    private mapName(kind: Api.DensityMapKind) {
        switch (kind) {
            case '2fo-fc':
                return <span>2Fo-Fc</span>;
            case 'fo-fc':
                return <span>Fo-Fc</span>;
            case 'em':
                return <span>EM map</span>;
        }
    }

    render() {
        return (
            <div className='rmsp-controls'>
                {this.controls(this.props.display).map((x, idx) => (
                    <React.Fragment key={idx}>
                        {x}
                        <div className='rmsp-control-vertical-spacer' /><div />
                    </React.Fragment>
                ))}
            </div>
        );
    }
}

export namespace DensityMapControls {
    export interface Props {
        viewer: Viewer;
        display: DensityMapDisplay[];

        toggleWireframe: (index: number) => void;
        toggleSolid: (index: number) => void;
        changeIso: (index: number, iso: number) => void;
        changeAlpha: (index: number, alpha: number) => void;
        changeColors: (index: number, colors: DensityMapDisplay['colors']) => void;
    }
}
