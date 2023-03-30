import React from 'react';
import ReactDOM from 'react-dom';
import { ReDNATCOMspApi as Api } from './api';
import { ReDNATCOMspApiImpl } from './api-impl';
import { DensityMapControls } from './density-map-controls';
import { Filters } from './filters';
import { ReDNATCOMspViewer } from './viewer';
import { NtCColors } from './colors';
import { ColorPicker } from './color-picker';
import { ColorBox, IconButton, PushButton, ToggleButton } from './controls';
import { Residue } from './residue';
import { toggleArray } from './util';
import { ToolBar, ToolBarContent } from './tool-bar';
import { Color } from '../../mol-util/color';
import { assertUnreachable } from '../../mol-util/type-helpers';
import './assets/imgs/density-wireframe.svg';
import './assets/imgs/nucleic.svg';
import './assets/imgs/palette.svg';
import './assets/imgs/pyramid.svg';
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

type ToolBarItems = 'structure' | 'ntc' | 'colors' | 'density-maps';
const ViewerToolBar = ToolBar.Specialize<ToolBarItems>();

const DefaultChainColor = Color(0xD9D9D9);
const DefaultDensityMapAlpha = 0.25;
const DefaultWaterColor = Color(0x0BB2FF);
export type VisualRepresentations = 'ball-and-stick' | 'cartoon' | 'ntc-tube';
export type DensityMapRepresentation = 'wireframe' | 'solid';

export const DefaultDensityDifferencePositiveColor = Color(0x00C300);
export const DefaultDensityDifferenceNegativeColor = Color(0xC30000);
export const DefaultDensityMapColor = Color(0x009DFF);
export type DensityMapDisplay = {
    kind: Api.DensityMapKind,
    representations: DensityMapRepresentation[],
    isoValue: number,

    alpha: number,
    colors: { color: Color, name: string }[];
}

const Display = {
    structures: {
        nucleicRepresentation: 'cartoon' as VisualRepresentations,
        showNucleic: true,

        proteinRepresentation: 'cartoon' as Omit<VisualRepresentations, 'ntc-tube'>,
        showProtein: false,

        showWater: false,

        showPyramids: true,
        pyramidsTransparent: false,

        classColors: { ...NtCColors.Classes },
        conformerColors: { ...NtCColors.Conformers },
        chainColor: DefaultChainColor,
        waterColor: DefaultWaterColor,
    },
    densityMaps: [] as DensityMapDisplay[],
};
export type Display = typeof Display;

class Locker {
    private isLocked = false;

    tryLock() {
        if (this.isLocked)
            return false;
        this.isLocked = true;

        return true;
    }

    unlock() {
        this.isLocked = false;
    }
}

interface State {
    display: Display;
    showControls: boolean;
}
export class ReDNATCOMsp extends React.Component<ReDNATCOMsp.Props, State> {
    private currentFilter: Filters.All = Filters.Empty();
    private presentConformers: string[] = [];
    private viewer: ReDNATCOMspViewer | undefined = undefined;
    // Used to lock out access to the viewer when it might be busy modifying its state tree
    private viewerLocker = new Locker();

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

    private finalizeNtCColorUpdate(display: Display) {
        this.viewer!.changeNtCColors(display).then(() => {
            if (display.structures.showNucleic && display.structures.nucleicRepresentation === 'ntc-tube') {
                this.viewer!.changeChainColor(['nucleic'], display).then(() => {
                    this.setState({ ...this.state, display });
                });
            } else
                this.setState({ ...this.state, display });
        });
    }

    private updateChainColor(color: number) {
        const display: Display = {
            ...this.state.display,
            structures: {
                ...this.state.display.structures,
                chainColor: Color(color),
            },
        };

        this.viewer!.changeChainColor(['nucleic', 'protein'], display);
        this.setState({ ...this.state, display });
    }

    private updateClassColor(changes: { cls: keyof NtCColors.Classes, color: number } | { cls: keyof NtCColors.Classes, color: number }[]) {
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

        this.finalizeNtCColorUpdate(display);
    }

    private updateConformerColor(changes: { conformer: keyof NtCColors.Conformers, color: number } | { conformer: keyof NtCColors.Conformers, color: number }[]) {
        const conformerColors = { ...this.state.display.structures.conformerColors };
        if (Array.isArray(changes))
            changes.forEach(item => conformerColors[item.conformer] = Color(item.color));
        else
            conformerColors[changes.conformer] = Color(changes.color);

        const display = { ...this.state.display };
        display.structures.conformerColors = conformerColors;

        this.finalizeNtCColorUpdate(display);
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

    apiQuery(type: keyof Api.Queries) {
        if (type === 'current-filter') {
            return this.currentFilter;
        } else if (type === 'current-model-number') {
            return this.viewer!.currentModelNumber();
        } else if (type === 'selected-structures') {
            return this.viewer!.getSelections();
        }

        assertUnreachable(type);
    }

    async command(cmd: Api.Command) {
        if (!this.viewer)
            return;

        if (cmd.type === 'redraw')
            window.dispatchEvent(new Event('resize'));
        else if (cmd.type === 'deselect-structures') {
            await this.viewer.actionDeselectStructures(this.state.display);
        } else if (cmd.type === 'filter') {
            const ret = await this.viewer.actionApplyFilter(cmd.filter, this.state.display);
            if (!ret) {
                ReDNATCOMspApi.event(Api.Events.FilterFailed(''));
                return;
            }

            this.currentFilter = cmd.filter;
            ReDNATCOMspApi.event(Api.Events.FilterApplied());
        } else if (cmd.type === 'highlight') {
            this.viewer.actionHighlight(cmd.highlights);
        } else if (cmd.type === 'select-structures') {
            const succeeded = await this.viewer.actionSelectStructures(cmd.selections, this.state.display);
            if (succeeded.length > 0) {
                this.viewer.focusOnSelection(succeeded[succeeded.length - 1]);
                ReDNATCOMspApi.event(Api.Events.StructuresSelectedOk(succeeded));
            } else
                ReDNATCOMspApi.event(Api.Events.StructuresSelectedFail());
        } else if (cmd.type === 'switch-model') {
            if (cmd.model < 1 || cmd.model > this.viewer.getModelCount())
                return;

            this.viewer.switchModel(cmd.model);
        } else if (cmd.type === 'switch-selection-granularity') {
            this.viewer.actionSwitchSelectionGranularity(cmd.granularity);
        } else if (cmd.type === 'unhighlight') {
            this.viewer.actionUnhighlight();
        }
    }

    loadStructure(coords: { data: string, type: Api.CoordinatesFormat, modelNumber: number }, densityMaps: { data: Uint8Array, type: Api.DensityMapFormat, kind: Api.DensityMapKind }[] | null) {
        if (this.viewer) {
            const display = { ...this.state.display };
            if (densityMaps) {
                display.densityMaps.length = densityMaps.length;
                for (let idx = 0; idx < densityMaps.length; idx++) {
                    const dm = densityMaps[idx];

                    if (dm.kind === 'fo-fc') {
                        display.densityMaps[idx] = {
                            kind: dm.kind,
                            representations: [],
                            isoValue: 0,
                            alpha: DefaultDensityMapAlpha,
                            colors: [
                                { color: DefaultDensityDifferencePositiveColor, name: '+' },
                                { color: DefaultDensityDifferenceNegativeColor, name: '-' },
                            ],
                        };
                    } else
                        display.densityMaps[idx] = {
                            kind: dm.kind,
                            representations: [],
                            isoValue: 0,
                            alpha: DefaultDensityMapAlpha,
                            colors: [{ color: DefaultDensityMapColor, name: 'Color' }],
                        };
                }
            } else
                display.densityMaps.length = 0;

            this.viewer.loadStructure(coords, densityMaps, display, coords.modelNumber).then(() => {
                this.presentConformers = this.viewer!.getPresentConformers();
                this.setState({ ...this.state, display });
                ReDNATCOMspApi.event(Api.Events.StructureLoaded());
            });
        }
    }

    viewerResidueSelected(desc: Residue.Description) {
        const residue = Api.Payloads.ResidueSelection(
            desc.modelNum,
            desc.chain,
            desc.cifChain,
            desc.seqId,
            desc.insCode,
            desc.altId,
            0
        );
        ReDNATCOMspApi.event(Api.Events.StructureRequested(residue));
    }

    viewerStructureDeselected() {
        this.viewer!.actionDeselectStructures(this.state.display);
        ReDNATCOMspApi.event(Api.Events.StructuresDeselected());
    }

    viewerStepSelected(stepName: string) {
        const step = Api.Payloads.StepSelection(stepName);
        ReDNATCOMspApi.event(Api.Events.StructureRequested(step));
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
                <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
                    <ViewerToolBar
                        orientation='vertical'
                        onBlockChanged={() => this.viewer?.redraw()}
                        controlBlocks={[
                            {
                                id: 'structure',
                                icon: './imgs/nucleic.svg',
                                content:
                                    <ToolBarContent style={{ width: '10em' }}>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <ToggleButton
                                                    text='Nucleic'
                                                    enabled={hasNucleic}
                                                    switchedOn={this.state.display.structures.showNucleic}
                                                    onClicked={() => {
                                                        if (!this.viewerLocker.tryLock())
                                                            return;

                                                        const display = { ...this.state.display };
                                                        display.structures.showNucleic = !display.structures.showNucleic,

                                                        this.viewer!.toggleSubstructure('nucleic', display).then(() => {
                                                            this.setState({ ...this.state, display });
                                                            this.viewerLocker.unlock();
                                                        }).catch(() => this.viewerLocker.unlock());
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text='Cartoon'
                                                    enabled={ready && this.state.display.structures.showNucleic}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        if (display.structures.nucleicRepresentation !== 'cartoon') {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            display.structures.nucleicRepresentation = 'cartoon';
                                                            this.viewer!.changeRepresentation('nucleic', display).then(() => {
                                                                this.setState({ ...this.state, display });
                                                                this.viewerLocker.unlock();
                                                            }).catch(() => this.viewerLocker.unlock());
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text='Ball-and-stick'
                                                    enabled={ready && this.state.display.structures.showNucleic}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        if (display.structures.nucleicRepresentation !== 'ball-and-stick') {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            display.structures.nucleicRepresentation = 'ball-and-stick';
                                                            this.viewer!.changeRepresentation('nucleic', display).then(() => {
                                                                this.setState({ ...this.state, display });
                                                                this.viewerLocker.unlock();
                                                            }).catch(() => this.viewerLocker.unlock());
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text='NtC tube'
                                                    enabled={ready && this.state.display.structures.showNucleic}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        if (display.structures.nucleicRepresentation !== 'ntc-tube') {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            display.structures.nucleicRepresentation = 'ntc-tube';
                                                            display.structures.showPyramids = false;

                                                            this.viewer!.changeRepresentation('nucleic', display).then(() => {
                                                                this.viewer!.changePyramids(display).then(() => {
                                                                    this.setState({ ...this.state, display });
                                                                    this.viewerLocker.unlock();
                                                                }).catch(() => this.viewerLocker.unlock());
                                                            }).catch(() => this.viewerLocker.unlock());
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className='rmsp-control-vertical-spacer' />

                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <ToggleButton
                                                    text='Protein'
                                                    enabled={hasProtein}
                                                    switchedOn={this.state.display.structures.showProtein}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        display.structures.showProtein = !display.structures.showProtein,
                                                        this.viewer!.toggleSubstructure('protein', display).then(() => {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            this.setState({ ...this.state, display });
                                                            this.viewerLocker.unlock();
                                                        }).catch(() => this.viewerLocker.unlock());
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text='Cartoon'
                                                    enabled={ready && this.state.display.structures.showProtein}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        if (display.structures.proteinRepresentation !== 'cartoon') {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            display.structures.proteinRepresentation = 'cartoon';
                                                            this.viewer!.changeRepresentation('protein', display).then(() => {
                                                                this.setState({ ...this.state, display });
                                                                this.viewerLocker.unlock();
                                                            }).catch(() => this.viewerLocker.unlock());
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text='Ball-and-stick'
                                                    enabled={ready && this.state.display.structures.showProtein}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        if (display.structures.proteinRepresentation !== 'ball-and-stick') {
                                                            if (!this.viewerLocker.tryLock())
                                                                return;

                                                            display.structures.proteinRepresentation = 'ball-and-stick';
                                                            this.viewer!.changeRepresentation('protein', display).then(() => {
                                                                this.setState({ ...this.state, display });
                                                                this.viewerLocker.unlock();
                                                            }).catch(() => this.viewerLocker.unlock());
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className='rmsp-control-vertical-spacer' />

                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <ToggleButton
                                                    text='Water'
                                                    enabled={hasWater}
                                                    switchedOn={this.state.display.structures.showWater}
                                                    onClicked={() => {
                                                        if (!this.viewerLocker.tryLock())
                                                            return;

                                                        const display = { ...this.state.display };
                                                        display.structures.showWater = !this.state.display.structures.showWater;
                                                        this.viewer!.toggleSubstructure('water', display).then(() => {
                                                            this.setState({ ...this.state, display });
                                                            this.viewerLocker.unlock();
                                                        }).catch(() => this.viewerLocker.unlock());
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </ToolBarContent>
                            },
                            {
                                id: 'ntc',
                                icon: './imgs/pyramid.svg',
                                content:
                                    <ToolBarContent style={{ width: '10em' }}>
                                        <div className='rmsp-control-vertical-section-caption'>
                                            Pyramids
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <ToggleButton
                                                    text={this.state.display.structures.showPyramids ? 'Shown' : 'Hidden'}
                                                    enabled={ready}
                                                    switchedOn={this.state.display.structures.showPyramids}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        display.structures.showPyramids = !display.structures.showPyramids;
                                                        this.viewer!.changePyramids(display).then(() => {
                                                            this.setState({ ...this.state, display });
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
                                            <div className='rmsp-control-item'>
                                                <PushButton
                                                    text={this.state.display.structures.pyramidsTransparent ? 'Transp.' : 'Solid'}
                                                    enabled={this.state.display.structures.showPyramids}
                                                    onClicked={() => {
                                                        const display = { ...this.state.display };
                                                        display.structures.pyramidsTransparent = !display.structures.pyramidsTransparent;
                                                        this.viewer!.changePyramids(display).then(() => {
                                                            this.setState({ ...this.state, display });
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </ToolBarContent>
                            },
                            {
                                id: 'colors',
                                icon: './imgs/palette.svg',
                                content:
                                    <ToolBarContent>
                                        <div className='rmsp-control-vertical-section-caption'>
                                            NtC classes
                                        </div>
                                        {(['A', 'B', 'BII', 'miB', 'Z', 'IC', 'OPN', 'SYN', 'N'] as (keyof NtCColors.Classes)[]).map(k =>
                                            <div className='rmsp-control-line' key={k}>
                                                <div className='rmsp-control-item-group'>
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

                                                    <div className='rmsp-control-horitontal-spacer'>{'\u00A0'}</div>

                                                    <IconButton
                                                        img='imgs/reload.svg'
                                                        onClicked={() => this.updateClassColor({ cls: k, color: NtCColors.Classes[k] })}
                                                        enabled={true}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className='rmsp-control-vertical-spacer' />

                                        <div className='rmsp-control-vertical-section-caption'>
                                            Conformers
                                        </div>
                                        {this.presentConformers.map(ntc => {
                                            const uprKey = ntc + '_Upr' as keyof NtCColors.Conformers;
                                            const lwrKey = ntc + '_Lwr' as keyof NtCColors.Conformers;

                                            return (
                                                <div className='rmsp-control-line' key={ntc}>
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

                                                        <div className='rmsp-control-horitontal-spacer'>{'\u00A0'}</div>

                                                        <IconButton
                                                            img='imgs/reload.svg'
                                                            onClicked={() => {
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

                                        <div className='rmsp-control-vertical-spacer' />

                                        <div className='rmsp-control-vertical-section-caption'>
                                            Structure
                                        </div>
                                        <div className='rmsp-control-line'>
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

                                                <div className='rmsp-control-horitontal-spacer'>{'\u00A0'}</div>

                                                <IconButton
                                                    img='imgs/reload.svg'
                                                    onClicked={() => this.updateChainColor(DefaultChainColor)}
                                                    enabled={true}
                                                />
                                            </div>
                                        </div>
                                        <div className='rmsp-control-line'>
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

                                                <div className='rmsp-control-horitontal-spacer'>{'\u00A0'}</div>

                                                <IconButton
                                                    img='imgs/reload.svg'
                                                    onClicked={() => this.updateChainColor(DefaultWaterColor)}
                                                    enabled={true}
                                                />
                                            </div>
                                        </div>
                                    </ToolBarContent>
                            },
                            {
                                id: 'density-maps',
                                icon: './imgs/density-wireframe.svg',
                                content:
                                    <ToolBarContent>
                                        <DensityMapControls
                                            viewer={this.viewer!}
                                            display={this.state.display.densityMaps}
                                            toggleWireframe={(index) => {
                                                const display = { ...this.state.display };
                                                display.densityMaps[index].representations = toggleArray(display.densityMaps[index].representations, 'wireframe');

                                                this.viewer!.changeDensityMap(index, display).then(() => {
                                                    this.setState({ ...this.state, display });
                                                });
                                            }}

                                            toggleSolid={(index) => {
                                                const display = { ...this.state.display };
                                                display.densityMaps[index].representations = toggleArray(display.densityMaps[index].representations, 'solid');

                                                this.viewer!.changeDensityMap(index, display).then(() => {
                                                    this.setState({ ...this.state, display });
                                                });
                                            }}
                                            changeIso={(index, v) => {
                                                const display = { ...this.state.display };
                                                display.densityMaps[index].isoValue = v;

                                                this.viewer!.changeDensityMap(index, display).then(() => {
                                                    this.setState({ ...this.state, display });
                                                });
                                            }}
                                            changeAlpha={(index, alpha) => {
                                                const display = { ...this.state.display };
                                                display.densityMaps[index].alpha = alpha;

                                                this.viewer!.changeDensityMap(index, display).then(() => {
                                                    this.setState({ ...this.state, display });
                                                });
                                            }}
                                            changeColors={(index, colors) => {
                                                const display = { ...this.state.display };
                                                display.densityMaps[index].colors = colors;

                                                this.viewer!.changeDensityMap(index, display).then(() => {
                                                    this.setState({ ...this.state, display });
                                                });
                                            }}
                                        />
                                    </ToolBarContent>,
                                disabled: !this.viewer?.hasDensityMaps()
                            }
                        ]}
                    />
                    <div id={this.props.elemId + '-viewer'} className='rmsp-viewer'></div>
                </div>
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
