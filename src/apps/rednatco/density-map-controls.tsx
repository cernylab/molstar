import React from 'react';
import { CollapsibleVertical, RangeSlider, SpinBox, ToggleButton } from './controls';
import { isoToFixed, numDecimals, stof } from './util';

export class DensityMapControls extends React.Component<DensityMapControls.Props> {
    render() {
        return (
            <CollapsibleVertical caption='Density map'>
                <div className='rmsp-controls'>
                    <div className='rmsp-controls-section-caption'>
                        Representations:
                    </div>
                    <div className='rmsp-controls-line'>
                        <div className='rmsp-control-item'>
                            <ToggleButton
                                text='Wireframe'
                                switchedOn={this.props.wireframe}
                                onClick={() => this.props.toggleWireframe()}
                                enabled={true}
                            />
                        </div>
                        <div className='rmsp-control-item'>
                            <ToggleButton
                                text='Solid'
                                switchedOn={this.props.solid}
                                onClick={() => this.props.toggleSolid()}
                                enabled={true}
                            />
                        </div>
                    </div>

                    <div className='rmsp-controls-section-caption'>
                        Iso:
                    </div>
                    <div className='rmsp-controls-line'>
                        <div className='rmsp-control-item'>
                            <RangeSlider
                                min={this.props.isoMin}
                                max={this.props.isoMax}
                                step={this.props.isoStep}
                                value={isoToFixed(this.props.iso, this.props.isoStep)}
                                onChange={(v) => this.props.changeIso(v!)}
                            />
                        </div>
                        <div className='rmsp-control-item'>
                            <div style={{ display: 'grid', gridTemplateColumns: '4em 1fr' }}>
                                <SpinBox
                                    min={this.props.isoMin}
                                    max={this.props.isoMax}
                                    step={this.props.isoStep}
                                    maxNumDecimals={Math.log10(this.props.isoStep) >= 0 ? 0 : -Math.log10(this.props.isoStep)}
                                    value={isoToFixed(this.props.iso, this.props.isoStep)}
                                    onChange={(n) => this.props.changeIso(n)}
                                    pathPrefix=''
                                />
                                <div />
                            </div>
                        </div>
                    </div>

                    <div className='rmsp-controls-section-caption'>
                        Transparency:
                    </div>
                    <div className='rmsp-controls-line'>
                        <div className='rmsp-control-item'>
                            <RangeSlider
                                min={0}
                                max={1}
                                step={0.1}
                                value={(1.0 - this.props.alpha)}
                                onChange={(v) => this.props.changeAlpha(1.0 - v!)}
                            />
                        </div>
                        <div className='rmsp-control-item'>
                            <div style={{ display: 'grid', gridTemplateColumns: '4em 1fr' }}>
                                <SpinBox
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    maxNumDecimals={1}
                                    value={(1.0 - this.props.alpha)}
                                    onChange={(n) => this.props.changeAlpha(1.0 - n)}
                                    pathPrefix=''
                                    formatter={v => {
                                        const n = stof(v);
                                        if (n !== undefined && numDecimals(v) > 1)
                                            return n.toFixed(1);
                                        return v;
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleVertical>
        );
    }
}

export namespace DensityMapControls {
    export interface Props {
        wireframe: boolean;
        solid: boolean;
        toggleWireframe: () => void;
        toggleSolid: () => void;

        isoMin: number;
        isoMax: number;
        isoStep: number;
        iso: number;
        changeIso: (iso: number) => void;

        alpha: number;
        changeAlpha: (alpha: number) => void;
    }
}
