import React from 'react';
import { ReDNATCOMspApi as Api } from './api';
import { ColorPicker } from './color-picker';
import { ColorBox, RangeSlider, SpinBox } from './controls';
import { DensityMapDisplay } from './index';
import { isoBounds, isoToFixed } from './util';
import { ReDNATCOMspViewer as Viewer } from './viewer';
import { Color } from '../../mol-util/color';
import SwitchBox from './SwitchBox';

export class DensityMapControls extends React.Component<DensityMapControls.Props> {
    private colors(index: number, colors: DensityMapDisplay['colors']) {
        const elems = new Array<JSX.Element>();

        for (let idx = 0; idx < colors.length; idx++) {
            const c = colors[idx];
            const e =
                <div
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
                <div className='bg-molstar rounded-lg p-2 mb-2' key={idx}>
                    <div className='flex justify-between'>
                        <div className='text-18px font-roboto-bold'>
                            {this.mapName(d.kind)}
                        </div>
                        <div className='flex'>
                            { this.colors(idx, d.colors) }
                        </div>
                    </div>
                    <SwitchBox name='Wire' visible={d.representations.includes('wireframe')} onToggle={() => this.props.toggleWireframe(idx)} enabled={true} />
                    <SwitchBox name='Solid' visible={d.representations.includes('solid')} onToggle={() => this.props.toggleSolid(idx)} enabled={true} />

                    <div className='mb-2'>
                        <div className='font-roboto-bold uppercase'>
                            Iso
                        </div>
                        <div className='flex items-center'>
                            <div className='mr-2'>
                                <RangeSlider
                                    min={_isoBounds.min}
                                    max={_isoBounds.max}
                                    step={_isoBounds.step}
                                    value={isoToFixed(d.isoValue, _isoBounds.step)}
                                    onChange={(v) => this.props.changeIso(idx, v!)}
                                />
                            </div>
                            <SpinBox
                                min={_isoBounds.min}
                                max={_isoBounds.max}
                                step={_isoBounds.step}
                                maxNumDecimals={Math.log10(_isoBounds.step) >= 0 ? 0 : -Math.log10(_isoBounds.step)}
                                value={isoToFixed(d.isoValue, _isoBounds.step)}
                                onChange={(n) => this.props.changeIso(idx, n)}
                                pathPrefix=''
                            />
                        </div>
                    </div>

                    <div>
                        <div className='font-roboto-bold uppercase'>
                            Transp
                        </div>
                        <div className='flex items-center'>
                            <div className='mr-2'>
                                <RangeSlider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={(1.0 - d.alpha) * 100}
                                    onChange={(n) => this.props.changeAlpha(idx, 1.0 - (n! / 100))}
                                />
                            </div>               
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
            <div className='rmsp-controls overflow-auto p-2'>
                {this.controls(this.props.display).map((x, idx) => (
                    <React.Fragment key={idx}>
                        {x}
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
