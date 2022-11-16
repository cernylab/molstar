import React from 'react';
import ReactDOM from 'react-dom';
import { ReDNATCOMspApi as Api } from './api';
import { ReDNATCOMspApiImpl } from './api-impl';
import { DensityMapControls } from './density-map-controls';
import { Filters } from './filters';
import { ReDNATCOMspViewer } from './viewer';
import { NtCColors } from './colors';
import { ColorPicker } from './color-picker';
import { CollapsibleVertical, ColorBox, PushButton, ToggleButton } from './controls';
import { toggleArray } from './util';
import { Color } from '../../mol-util/color';
import { assertUnreachable } from '../../mol-util/type-helpers';
import './index.html';

const ConformersByClass = {
    A: ['AA00_Upr', 'AA00_Lwr', 'AA02_Upr', 'AA02_Lwr', 'AA03_Upr', 'AA03_Lwr', 'AA04_Upr', 'AA04_Lwr', 'AA08_Upr', 'AA08_Lwr', 'AA09_Upr', 'AA09_Lwr', 'AA01_Upr', 'AA01_Lwr', 'AA05_Upr', 'AA05_Lwr', 'AA06_Upr', 'AA06_Lwr', 'AA10_Upr', 'AA10_Lwr', 'AA11_Upr', 'AA11_Lwr', 'AA07_Upr', 'AA07_Lwr', 'AA12_Upr', 'AA12_Lwr', 'AA13_Upr', 'AA13_Lwr', 'AB01_Upr', 'AB02_Upr', 'AB03_Upr', 'AB04_Upr', 'AB05_Upr', 'BA01_Lwr', 'BA05_Lwr', 'BA09_Lwr', 'BA08_Lwr', 'BA10_Lwr', 'BA13_Lwr', 'BA16_Lwr', 'BA17_Lwr', 'AAS1_Lwr', 'AB1S_Upr'],
    B: ['AB01_Lwr', 'AB02_Lwr', 'AB03_Lwr', 'AB04_Lwr', 'AB05_Lwr', 'BA09_Upr', 'BA10_Upr', 'BB00_Upr', 'BB00_Lwr', 'BB01_Upr', 'BB01_Lwr', 'BB17_Upr', 'BB17_Lwr', 'BB02_Upr', 'BB02_Lwr', 'BB03_Upr', 'BB03_Lwr', 'BB11_Upr', 'BB11_Lwr', 'BB16_Upr', 'BB16_Lwr', 'BB04_Upr', 'BB05_Upr', 'BB1S_Upr', 'BB2S_Upr', 'BBS1_Lwr'],
    BII: ['BA08_Upr', 'BA13_Upr', 'BA16_Upr', 'BA17_Upr', 'BB04_Lwr', 'BB05_Lwr', 'BB07_Upr', 'BB07_Lwr', 'BB08_Upr', 'BB08_Lwr'],
    miB: ['BB10_Upr', 'BB10_Lwr', 'BB12_Upr', 'BB12_Lwr', 'BB13_Upr', 'BB13_Lwr', 'BB14_Upr', 'BB14_Lwr', 'BB15_Upr', 'BB15_Lwr', 'BB20_Upr', 'BB20_Lwr'],
    IC: ['IC01_Upr', 'IC01_Lwr', 'IC02_Upr', 'IC02_Lwr', 'IC03_Upr', 'IC03_Lwr', 'IC04_Upr', 'IC04_Lwr', 'IC05_Upr', 'IC05_Lwr', 'IC06_Upr', 'IC06_Lwr', 'IC07_Upr', 'IC07_Lwr'],
    OPN: ['OP01_Upr', 'OP01_Lwr', 'OP02_Upr', 'OP02_Lwr', 'OP03_Upr', 'OP03_Lwr', 'OP04_Upr', 'OP04_Lwr', 'OP05_Upr', 'OP05_Lwr', 'OP06_Upr', 'OP06_Lwr', 'OP07_Upr', 'OP07_Lwr', 'OP08_Upr', 'OP08_Lwr', 'OP09_Upr', 'OP09_Lwr', 'OP10_Upr', 'OP10_Lwr', 'OP11_Upr', 'OP11_Lwr', 'OP12_Upr', 'OP12_Lwr', 'OP13_Upr', 'OP13_Lwr', 'OP14_Upr', 'OP14_Lwr', 'OP15_Upr', 'OP15_Lwr', 'OP16_Upr', 'OP16_Lwr', 'OP17_Upr', 'OP17_Lwr', 'OP18_Upr', 'OP18_Lwr', 'OP19_Upr', 'OP19_Lwr', 'OP20_Upr', 'OP20_Lwr', 'OP21_Upr', 'OP21_Lwr', 'OP22_Upr', 'OP22_Lwr', 'OP23_Upr', 'OP23_Lwr', 'OP24_Upr', 'OP24_Lwr', 'OP25_Upr', 'OP25_Lwr', 'OP26_Upr', 'OP26_Lwr', 'OP27_Upr', 'OP27_Lwr', 'OP28_Upr', 'OP28_Lwr', 'OP29_Upr', 'OP29_Lwr', 'OP30_Upr', 'OP30_Lwr', 'OP31_Upr', 'OP31_Lwr', 'OPS1_Upr', 'OPS1_Lwr', 'OP1S_Upr', 'OP1S_Lwr'],
    SYN: ['AAS1_Upr', 'AB1S_Lwr', 'AB2S_Lwr', 'BB1S_Lwr', 'BB2S_Lwr', 'BBS1_Upr', 'ZZ1S_Lwr', 'ZZ2S_Lwr', 'ZZS1_Upr', 'ZZS2_Upr'],
    Z: ['ZZ01_Upr', 'ZZ01_Lwr', 'ZZ02_Upr', 'ZZ02_Lwr', 'ZZ1S_Upr', 'ZZ2S_Upr', 'ZZS1_Lwr', 'ZZS2_Lwr'],
    N: ['NANT_Upr', 'NANT_Lwr'],
};
type ConformersByClass = typeof ConformersByClass;

const DefaultChainColor = Color(0xD9D9D9);
const DefaultDensityMapAlpha = 0.25;
const DefaultWaterColor = Color(0x0BB2FF);
export type VisualRepresentations = 'ball-and-stick'|'cartoon';
export type DensityMapRepresentation = 'wireframe'|'solid';
export type DensityMapKind = '2fo-fc'|'fo-fc'|'em';

export const DefaultDensityDifferencePositiveColor = Color(0x00C300);
export const DefaultDensityDifferenceNegativeColor = Color(0xC30000);
export const DefaultDensityMapColor = Color(0x009DFF);
const DefaultDensityMapDisplay = {
    kind: '2fo-fc' as DensityMapKind,
    representations: ['solid'] as DensityMapRepresentation[],
    isoValue: 0,

    alpha: DefaultDensityMapAlpha,
    colors: [{ color: DefaultDensityMapColor, name: 'Color' }],
};
export type DensityMapDisplay = typeof DefaultDensityMapDisplay;

const Display = {
    structures: {
        representation: 'cartoon' as VisualRepresentations,

        showNucleic: true,
        showProtein: false,
        showWater: false,

        showPyramids: true,
        pyramidsTransparent: false,

        showBalls: false,
        ballsTransparent: false,

        modelNumber: 1,

        classColors: { ...NtCColors.Classes },
        conformerColors: { ...NtCColors.Conformers },
        chainColor: DefaultChainColor,
        waterColor: DefaultWaterColor,
    },
    densityMaps: [] as DensityMapDisplay[],
};
export type Display = typeof Display;

function capitalize(s: string) {
    if (s.length === 0)
        return s;
    return s[0].toLocaleUpperCase() + s.slice(1);
}

interface State {
    display: Display;
    showControls: boolean;
}
export class ReDNATCOMsp extends React.Component<ReDNATCOMsp.Props, State> {
    private currentFilter: Filters.All = Filters.Empty();
    private presentConformers: string[] = [];
    private viewer: ReDNATCOMspViewer|undefined = undefined;
    private selectedStep: Api.Payloads.StepSelection|undefined = undefined;

    constructor(props: ReDNATCOMsp.Props) {
        super(props);

        this.state = {
            display: { ...Display },
            showControls: false,
        };
    }

    private classColorToConformers(k: keyof ConformersByClass, color: Color) {
        const updated: Partial<NtCColors.Conformers> = {};
        ConformersByClass[k].map(cfmr => updated[cfmr as keyof NtCColors.Conformers] = color);

        return updated;
    }

    private updateChainColor(color: number) {
        const display: Display = {
            ...this.state.display,
            structures: {
                ...this.state.display.structures,
                chainColor: Color(color),
            },
        };

        this.viewer!.changeChainColor(display);
        this.setState({ ...this.state, display });
    }

    private updateClassColor(changes: { cls: keyof NtCColors.Classes, color: number }|{ cls: keyof NtCColors.Classes, color: number }[]) {
        const classColors = { ...this.state.display.structures.classColors };

        const isArray = Array.isArray(changes);
        if (isArray) {
            changes.forEach(item => classColors[item.cls] = Color(item.color));
        } else
            classColors[changes.cls] = Color(changes.color);

        const conformerColors: NtCColors.Conformers = {
            ...this.state.display.structures.conformerColors,
            ...(isArray
                ? changes.map(item => this.classColorToConformers(item.cls, Color(item.color)))
                : this.classColorToConformers(changes.cls, Color(changes.color)))
        };

        const display = { ...this.state.display };
        display.structures.classColors = classColors;
        display.structures.conformerColors = conformerColors;

        this.viewer!.changeNtCColors(display);
        this.setState({ ...this.state, display });
    }

    private updateConformerColor(changes: { conformer: keyof NtCColors.Conformers, color: number }|{ conformer: keyof NtCColors.Conformers, color: number }[]) {
        const conformerColors = { ...this.state.display.structures.conformerColors };
        if (Array.isArray(changes))
            changes.forEach(item => conformerColors[item.conformer] = Color(item.color));
        else
            conformerColors[changes.conformer] = Color(changes.color);

        const display = { ...this.state.display };
        display.structures.conformerColors = conformerColors;

        this.viewer!.changeNtCColors(display);
        this.setState({ ...this.state, display });
    }

    private updateWaterColor(color: number) {
        const display: Display = {
            ...this.state.display,
            structures: {
                ...this.state.display.structures,
                waterColor: Color(color),
            },
        };

        this.viewer!.changeWaterColor(display);
        this.setState({ ...this.state, display });
    }

    apiQuery(type: Api.Queries.Type) {
        if (type === 'current-filter') {
            return Api.Queries.CurrentFilter(this.currentFilter);
        } else if (type === 'current-model-number') {
            return Api.Queries.CurrentModelNumber(this.viewer!.currentModelNumber());
        } else if (type === 'selected-step') {
            return this.selectedStep ? Api.Queries.SelectedStep(this.selectedStep) : Api.Queries.SelectedStep();
        }

        assertUnreachable(type);
    }

    async command(cmd: Api.Command) {
        if (!this.viewer)
            return;

        if (cmd.type === 'redraw')
            window.dispatchEvent(new Event('resize'));
        else if (cmd.type === 'deselect-step') {
            await this.viewer.actionDeselectStep(this.state.display);
            this.selectedStep = void 0;
        } else if (cmd.type === 'filter') {
            const ret = await this.viewer.actionApplyFilter(cmd.filter);
            if (!ret) {
                ReDNATCOMspApi.event(Api.Events.FilterFailed(''));
                return;
            }

            this.currentFilter = cmd.filter;
            ReDNATCOMspApi.event(Api.Events.FilterApplied());
        } else if (cmd.type === 'select-step') {
            const success = await this.viewer.actionSelectStep(cmd.step, cmd.prev, cmd.next, this.state.display);
            if (!success) {
                ReDNATCOMspApi.event(Api.Events.StepSelectedFail());
                return;
            }

            this.selectedStep = cmd.step;
            this.viewer.focusOnSelectedStep();

            ReDNATCOMspApi.event(Api.Events.StepSelectedOk(this.selectedStep.name));
        } else if (cmd.type === 'switch-model') {
            if (cmd.model < 1 || cmd.model > this.viewer.getModelCount())
                return;

            const display: Display = {
                ...this.state.display,
                structures: {
                    ...this.state.display.structures,
                    modelNumber: cmd.model,
                },
            };

            this.viewer.switchModel(display.structures.modelNumber);
            this.setState({ ...this.state, display });
        }
    }

    loadStructure(coords: { data: string, type: 'pdb'|'cif' }, densityMaps: { data: Uint8Array, type: 'ccp4'|'dsn6', kind: '2fo-fc'|'fo-fc'|'em' }[]|null) {
        if (this.viewer) {
            const display = { ...this.state.display };
            if (densityMaps) {
                display.densityMaps.length = densityMaps.length;
                for (let idx = 0; idx < densityMaps.length; idx++) {
                    const dm = densityMaps[idx];

                    if (dm.kind === 'fo-fc') {
                        display.densityMaps[idx] = {
                            ...DefaultDensityMapDisplay,
                            kind: dm.kind,
                            colors: [
                                { color: DefaultDensityDifferencePositiveColor, name: '+ color' },
                                { color: DefaultDensityDifferenceNegativeColor, name: '- color' },
                            ],
                        };
                    } else
                        display.densityMaps[idx] = { ...DefaultDensityMapDisplay, kind: dm.kind };
                }
            } else
                display.densityMaps.length = 0;

            this.viewer.loadStructure(coords, densityMaps, display).then(() => {
                this.presentConformers = this.viewer!.getPresentConformers();
                this.setState({ ...this.state, display });
                ReDNATCOMspApi.event(Api.Events.StructureLoaded());
            });
        }
    }

    viewerStepDeselected() {
        this.selectedStep = void 0;
        this.viewer!.actionDeselectStep(this.state.display);
        ReDNATCOMspApi.event(Api.Events.StepDeselected());
    }

    viewerStepSelected(stepName: string) {
        ReDNATCOMspApi.event(Api.Events.StepRequested(stepName));
    }

    componentDidMount() {
        if (!this.viewer) {
            const elem = document.getElementById(this.props.elemId + '-viewer');
            ReDNATCOMspViewer.create(elem!, this).then(viewer => {
                this.viewer = viewer;
                this.viewer.loadReferenceConformers().then(() => {
                    ReDNATCOMspApi._bind(this);
                    ReDNATCOMspApi.event(Api.Events.Ready());
                });
            });
        }
    }

    render() {
        const ready = this.viewer?.isReady() ?? false;

        const hasNucleic = this.viewer?.has('structure', 'nucleic') ?? false;
        const hasProtein = this.viewer?.has('structure', 'protein') ?? false;
        const hasWater = this.viewer?.has('structure', 'water') ?? false;

        return (
            <div className='rmsp-app'>
                <div id={this.props.elemId + '-viewer'} className='rmsp-viewer'></div>
                <CollapsibleVertical caption={'Controls'}>
                    <div className='rmsp-controls'>
                        <div className='rmsp-controls-section-caption'>Representation</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item'>
                                <PushButton
                                    text={capitalize(this.state.display.structures.representation)}
                                    enabled={ready}
                                    onClick={() => {
                                        const display = { ...this.state.display };
                                        display.structures.representation = display.structures.representation === 'cartoon' ? 'ball-and-stick' : 'cartoon';
                                        this.viewer!.changeRepresentation(display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='rmsp-controls-section-caption'>Substructure parts</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    text='Nucleic'
                                    enabled={hasNucleic}
                                    switchedOn={this.state.display.structures.showNucleic}
                                    onClick={() => {
                                        const display = { ...this.state.display };
                                        display.structures.showNucleic = !display.structures.showNucleic,
                                        this.viewer!.toggleSubstructure('nucleic', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    text='Protein'
                                    enabled={hasProtein}
                                    switchedOn={this.state.display.structures.showProtein}
                                    onClick={() => {
                                        const display = { ...this.state.display };
                                        display.structures.showProtein = !display.structures.showProtein,
                                        this.viewer!.toggleSubstructure('protein', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    text='Water'
                                    enabled={hasWater}
                                    switchedOn={this.state.display.structures.showWater}
                                    onClick={() => {
                                        const display = { ...this.state.display };
                                        display.structures.showWater = !this.state.display.structures.showWater;
                                        this.viewer!.toggleSubstructure('water', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='rmsp-controls-section-caption'>NtC visuals</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item-group'>
                                <div className='rmsp-control-item'>
                                    <ToggleButton
                                        text='Pyramids'
                                        enabled={ready}
                                        switchedOn={this.state.display.structures.showPyramids}
                                        onClick={() => {
                                            const display = { ...this.state.display };
                                            display.structures.showPyramids = !display.structures.showPyramids;
                                            this.viewer!.changePyramids(display);
                                            this.setState({ ...this.state, display });
                                        }}
                                    />
                                </div>
                                <div className='rmsp-control-item'>
                                    <PushButton
                                        text={this.state.display.structures.pyramidsTransparent ? 'Transparent' : 'Solid'}
                                        enabled={this.state.display.structures.showPyramids}
                                        onClick={() => {
                                            const display = { ...this.state.display };
                                            display.structures.pyramidsTransparent = !display.structures.pyramidsTransparent;
                                            this.viewer!.changePyramids(display);
                                            this.setState({ ...this.state, display });
                                        }}
                                    />
                                </div>
                            </div>
                            <div className='rmsp-control-item-group'>
                                <div className='rmsp-control-item'>
                                    <ToggleButton
                                        text='Balls'
                                        enabled={false}
                                        switchedOn={false}
                                        onClick={() => {}}
                                    />
                                </div>
                                <div className='rmsp-control-item'>
                                    <PushButton
                                        text={this.state.display.structures.ballsTransparent ? 'Transparent' : 'Solid'}
                                        enabled={this.state.display.structures.showBalls}
                                        onClick={() => {
                                            const display = { ...this.state.display };
                                            display.structures.showBalls = !display.structures.showBalls;

                                            /* No balls today... */
                                            this.setState({ ...this.state, display });
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='rmsp-controls-section-caption'>NtC classes colors</div>
                        <div className='rmsp-controls-line'>
                            {(['A', 'B', 'BII', 'miB', 'Z', 'IC', 'OPN', 'SYN', 'N'] as (keyof NtCColors.Classes)[]).map(k =>
                                <div className='rmsp-control-item-group' key={k}>
                                    <div
                                        className='rmsp-control-item'
                                        onClick={evt => ColorPicker.create(
                                            evt,
                                            this.state.display.structures.classColors[k],
                                            color => this.updateClassColor({ cls: k, color })
                                        )}
                                    >
                                        <ColorBox caption={k} color={this.state.display.structures.classColors[k]} />
                                    </div>
                                    <PushButton
                                        text='R'
                                        onClick={() => this.updateClassColor({ cls: k, color: NtCColors.Classes[k] })}
                                        enabled={true}
                                    />
                                </div>
                            )}
                        </div>

                        <div className='rmsp-controls-section-caption'>NtC colors</div>
                        <div className='rmsp-controls-line'>
                            {this.presentConformers.map(ntc => {
                                const uprKey = ntc + '_Upr' as keyof NtCColors.Conformers;
                                const lwrKey = ntc + '_Lwr' as keyof NtCColors.Conformers;

                                return (
                                    <div className='rmsp-control-item' key={ntc}>
                                        <div className='rmsp-control-item-group'>
                                            <div
                                                className='rmsp-control-item'
                                                onClick={evt => ColorPicker.create(
                                                    evt,
                                                    this.state.display.structures.conformerColors[uprKey],
                                                    color => this.updateConformerColor({ conformer: uprKey, color })
                                                )}
                                            >
                                                <ColorBox caption={`${ntc.slice(0, 2)}`} color={this.state.display.structures.conformerColors[uprKey]} />
                                            </div>
                                            <div
                                                className='rmsp-control-item'
                                                onClick={evt => ColorPicker.create(
                                                    evt,
                                                    this.state.display.structures.conformerColors[lwrKey],
                                                    color => this.updateConformerColor({ conformer: lwrKey, color })
                                                )}
                                            >
                                                <ColorBox caption={`${ntc.slice(2)}`} color={this.state.display.structures.conformerColors[lwrKey]} />
                                            </div>
                                            <PushButton
                                                text='R'
                                                onClick={() => {
                                                    this.updateConformerColor([
                                                        { conformer: uprKey, color: NtCColors.Conformers[uprKey] },
                                                        { conformer: lwrKey, color: NtCColors.Conformers[lwrKey] }
                                                    ]);
                                                }}
                                                enabled={true}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className='rmsp-controls-section-caption'>Structure colors</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item-group'>
                                <div
                                    className='rmsp-control-item'
                                    onClick={evt => ColorPicker.create(
                                        evt,
                                        this.state.display.structures.chainColor,
                                        color => this.updateChainColor(color)
                                    )}
                                >
                                    <ColorBox caption='Chains' color={this.state.display.structures.chainColor} />
                                </div>
                                <PushButton
                                    text='R'
                                    onClick={() => this.updateChainColor(DefaultChainColor)}
                                    enabled={true}
                                />
                            </div>
                            <div className='rmsp-control-item-group'>
                                <div
                                    className='rmsp-control-item'
                                    onClick={evt => ColorPicker.create(
                                        evt,
                                        this.state.display.structures.waterColor,
                                        color => this.updateWaterColor(color)
                                    )}
                                >
                                    <ColorBox caption='Waters' color={this.state.display.structures.waterColor} />
                                </div>
                                <PushButton
                                    text='R'
                                    onClick={() => this.updateChainColor(DefaultWaterColor)}
                                    enabled={true}
                                />
                            </div>

                        </div>
                    </div>
                </CollapsibleVertical>
                {this.viewer?.hasDensityMaps()
                    ? <DensityMapControls
                        viewer={this.viewer}
                        display={this.state.display.densityMaps}
                        toggleWireframe={(index) => {
                            const display = { ...this.state.display };
                            display.densityMaps[index].representations = toggleArray(display.densityMaps[index].representations, 'wireframe');

                            this.viewer!.changeDensityMap(index, display);
                            this.setState({ ...this.state, display });
                        }}

                        toggleSolid={(index) => {
                            const display = { ...this.state.display };
                            display.densityMaps[index].representations = toggleArray(display.densityMaps[index].representations, 'solid');

                            this.viewer!.changeDensityMap(index, display);
                            this.setState({ ...this.state, display });
                        }}
                        changeIso={(index, v) => {
                            const display = { ...this.state.display };
                            display.densityMaps[index].isoValue = v;

                            this.viewer!.changeDensityMap(index, display);
                            this.setState({ ...this.state, display });
                        }}
                        changeAlpha={(index, alpha) => {
                            const display = { ...this.state.display };
                            display.densityMaps[index].alpha = alpha;

                            this.viewer!.changeDensityMap(index, display);
                            this.setState({ ...this.state, display });
                        }}
                        changeColors={(index, colors) => {
                            const display = { ...this.state.display };
                            display.densityMaps[index].colors = colors;

                            this.viewer!.changeDensityMap(index, display);
                            this.setState({ ...this.state, display });
                        }}
                    />
                    : undefined
                }
            </div>
        );
    }
}

export namespace ReDNATCOMsp {
    export interface Props {
        elemId: string;
    }

    export function init(elemId: string) {
        const elem = document.getElementById(elemId);
        if (!elem)
            throw new Error(`Element ${elemId} does not exist`);

        ReactDOM.render(<ReDNATCOMsp elemId={elemId} />, elem);
    }
}

export const ReDNATCOMspApi = new ReDNATCOMspApiImpl();
