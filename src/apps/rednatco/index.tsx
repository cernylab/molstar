import React from 'react';
import ReactDOM from 'react-dom';
import * as IDs from './idents';
import { DnatcoConfalPyramids } from '../../extensions/dnatco';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { ConfalPyramidsColorThemeParams } from '../../extensions/dnatco/confal-pyramids/color';
import { Loci } from '../../mol-model/loci';
import { Structure } from '../../mol-model/structure';
import { PluginBehavior, PluginBehaviors } from '../../mol-plugin/behavior';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginContext } from '../../mol-plugin/context';
import { PluginSpec } from '../../mol-plugin/spec';
import { LociLabel } from '../../mol-plugin-state/manager/loci-label';
import { PluginStateObject as PSO } from '../../mol-plugin-state/objects';
import { StateTransforms } from '../../mol-plugin-state/transforms';
import { RawData } from '../../mol-plugin-state/transforms/data';
import { createPluginUI } from '../../mol-plugin-ui';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { Representation } from '../../mol-repr/representation';
import { StateSelection } from '../../mol-state';
import { StateTreeSpine } from '../../mol-state/tree/spine';
import { lociLabel } from '../../mol-theme/label';
import { Color } from '../../mol-util/color';
import { arrayMax } from '../../mol-util/array';
import { Binding } from '../../mol-util/binding';
import { ButtonsType, ModifiersKeys } from '../../mol-util/input/input-observer';
import { MarkerAction } from '../../mol-util/marker-action';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { ObjectKeys } from '../../mol-util/type-helpers';
import './index.html';
import './molstar.css';
import './rednatco-molstar.css';

const Extensions = {
    'ntc-balls-pyramids-prop': PluginSpec.Behavior(DnatcoConfalPyramids),
};

const BaseRef = 'rdo';
const AnimationDurationMsec = 150;

function capitalize(s: string) {
    if (s.length === 0)
        return s;
    return s[0].toLocaleUpperCase() + s.slice(1);

}

class PushButton extends React.Component<{ caption: string, enabled: boolean, onClick: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton ${this.props.enabled ? '' : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClick() : {}}
            >
                <div className={`${this.props.enabled ? 'rmsp-pushbutton-text' : 'rmsp-pushbutton-text-disabled'}`}>{this.props.caption}</div>
            </div>
        );
    }
}

class ToggleButton extends React.Component<{ caption: string, enabled: boolean, switchedOn: boolean, onClick: () => void }> {
    render() {
        return (
            <div
                className={`rmsp-pushbutton ${this.props.enabled ? (this.props.switchedOn ? 'rmsp-togglebutton-switched-on' : 'rmsp-togglebutton-switched-off') : 'rmsp-pushbutton-disabled'}`}
                onClick={() => this.props.enabled ? this.props.onClick() : {}}
            >
                <div className={`${this.props.enabled ? 'rmsp-pushbutton-text' : 'rmsp-pushbutton-text-disabled'}`}>{this.props.caption}</div>
            </div>
        );
    }
}

const Display = {
    representation: 'cartoon',

    showNucleic: true,
    showProtein: false,
    showWater: false,

    showPyramids: true,

    modelNumber: 1,
};
type Display = typeof Display;

const ReDNATCOLociLabelProvider = PluginBehavior.create({
    name: 'watlas-loci-label-provider',
    category: 'interaction',
    ctor: class implements PluginBehavior<undefined> {
        private f = {
            label: (loci: Loci) => {
                switch (loci.kind) {
                    case 'structure-loci':
                    case 'element-loci':
                        return lociLabel(loci);
                    default:
                        return '';
                }
            },
            group: (label: LociLabel) => label.toString().replace(/Model [0-9]+/g, 'Models'),
            priority: 100
        };
        register() { this.ctx.managers.lociLabels.addProvider(this.f); }
        unregister() { this.ctx.managers.lociLabels.removeProvider(this.f); }
        constructor(protected ctx: PluginContext) { }
    },
    display: { name: 'ReDNATCO labeling' }
});

const ReDNATCOLociSelectionBindings = {
    clickFocus: Binding([Binding.Trigger(ButtonsType.Flag.Secondary)], 'Focus camera on selected loci using ${triggers}'),
    clickToggle: Binding([Binding.Trigger(ButtonsType.Flag.Primary)], 'Set selection to clicked element using ${triggers}.'),
    clickDeselectAllOnEmpty: Binding([Binding.Trigger(ButtonsType.Flag.Primary)], 'Deselect all when clicking on nothing using ${triggers}.'),
};
const ReDNATCOLociSelectionParams = {
    bindings: PD.Value(ReDNATCOLociSelectionBindings, { isHidden: true }),
};
type WatlasLociSelectionProps = PD.Values<typeof ReDNATCOLociSelectionParams>;

const ReDNATCOLociSelectionProvider = PluginBehavior.create({
    name: 'watlas-loci-selection-provider',
    category: 'interaction',
    display: { name: 'Interactive loci selection' },
    params: () => ReDNATCOLociSelectionParams,
    ctor: class extends PluginBehavior.Handler<WatlasLociSelectionProps> {
        private spine: StateTreeSpine.Impl;
        private lociMarkProvider = (reprLoci: Representation.Loci, action: MarkerAction) => {
            if (!this.ctx.canvas3d) return;
            this.ctx.canvas3d.mark({ loci: reprLoci.loci }, action);
        };
        private applySelectMark(ref: string, clear?: boolean) {
            const cell = this.ctx.state.data.cells.get(ref);
            if (cell && PSO.isRepresentation3D(cell.obj)) {
                this.spine.current = cell;
                const so = this.spine.getRootOfType(PSO.Molecule.Structure);
                if (so) {
                    if (clear) {
                        this.lociMarkProvider({ loci: Structure.Loci(so.data) }, MarkerAction.Deselect);
                    }
                    const loci = this.ctx.managers.structure.selection.getLoci(so.data);
                    this.lociMarkProvider({ loci }, MarkerAction.Select);
                }
            }
        }
        private focusOnLoci(loci: Representation.Loci) {
            if (!this.ctx.canvas3d)
                return;

            const sphere = Loci.getBoundingSphere(loci.loci);
            if (!sphere)
                return;
            const snapshot = this.ctx.canvas3d.camera.getSnapshot();
            snapshot.target = sphere.center;

            PluginCommands.Camera.SetSnapshot(this.ctx, { snapshot, durationMs: AnimationDurationMsec });
        }
        register() {
            const lociIsEmpty = (current: Representation.Loci) => Loci.isEmpty(current.loci);
            const lociIsNotEmpty = (current: Representation.Loci) => !Loci.isEmpty(current.loci);

            const actions: [keyof typeof ReDNATCOLociSelectionBindings, (current: Representation.Loci) => void, ((current: Representation.Loci) => boolean) | undefined][] = [
                ['clickFocus', current => this.focusOnLoci(current), lociIsNotEmpty],
                ['clickDeselectAllOnEmpty', () => this.ctx.managers.interactivity.lociSelects.deselectAll(), lociIsEmpty],
                ['clickToggle', current => {
                    if (current.loci.kind === 'element-loci')
                        this.ctx.managers.interactivity.lociSelects.toggle(current, true);
                },
                lociIsNotEmpty],
            ];

            // sort the action so that the ones with more modifiers trigger sooner.
            actions.sort((a, b) => {
                const x = this.params.bindings[a[0]], y = this.params.bindings[b[0]];
                const k = x.triggers.length === 0 ? 0 : arrayMax(x.triggers.map(t => ModifiersKeys.size(t.modifiers)));
                const l = y.triggers.length === 0 ? 0 : arrayMax(y.triggers.map(t => ModifiersKeys.size(t.modifiers)));
                return l - k;
            });

            this.subscribeObservable(this.ctx.behaviors.interaction.click, ({ current, button, modifiers }) => {
                if (!this.ctx.canvas3d) return;

                // only trigger the 1st action that matches
                for (const [binding, action, condition] of actions) {
                    if (Binding.match(this.params.bindings[binding], button, modifiers) && (!condition || condition(current))) {
                        action(current);
                        break;
                    }
                }
            });

            this.ctx.managers.interactivity.lociSelects.addProvider(this.lociMarkProvider);

            this.subscribeObservable(this.ctx.state.events.object.created, ({ ref }) => this.applySelectMark(ref));

            // re-apply select-mark to all representation of an updated structure
            this.subscribeObservable(this.ctx.state.events.object.updated, ({ ref, obj, oldObj, oldData, action }) => {
                const cell = this.ctx.state.data.cells.get(ref);
                if (cell && PSO.Molecule.Structure.is(cell.obj)) {
                    const structure: Structure = obj.data;
                    const oldStructure: Structure | undefined = action === 'recreate' ? oldObj?.data :
                        action === 'in-place' ? oldData : undefined;
                    if (oldStructure &&
                        Structure.areEquivalent(structure, oldStructure) &&
                        Structure.areHierarchiesEqual(structure, oldStructure)) return;

                    const reprs = this.ctx.state.data.select(StateSelection.Generators.ofType(PSO.Molecule.Structure.Representation3D, ref));
                    for (const repr of reprs) this.applySelectMark(repr.transform.ref, true);
                }
            });

        }
        unregister() {
        }
        constructor(ctx: PluginContext, params: WatlasLociSelectionProps) {
            super(ctx, params);
            this.spine = new StateTreeSpine.Impl(ctx.state.data.cells);
        }
    },
});

class ReDNATCOMspViewer {
    constructor(public plugin: PluginUIContext) {
    }

    private getBuilder(id: IDs.ID, sub: IDs.Substructure|'' = '', ref = BaseRef) {
        return this.plugin.state.data.build().to(IDs.ID(id, sub, ref));
    }

    private pyramidsParams(colors: Map<string, Color>, visible: Map<string, boolean>, transparent: boolean) {
        const typeParams = {} as PD.Values<ConfalPyramidsParams>;
        for (const k of Reflect.ownKeys(ConfalPyramidsParams) as (keyof ConfalPyramidsParams)[]) {
            if (ConfalPyramidsParams[k].type === 'boolean')
                (typeParams[k] as any) = visible.get(k) ?? ConfalPyramidsParams[k]['defaultValue'];
        }

        const colorParams = {} as Record<string, Color>; // HAKZ until we implement changeable pyramid colors in Molstar !!!
        for (const k of Reflect.ownKeys(ConfalPyramidsColorThemeParams) as (keyof ConfalPyramidsColorThemeParams)[])
            colorParams[k] = colors.get(k) ?? ConfalPyramidsColorThemeParams[k]['defaultValue'];

        return {
            type: { name: 'confal-pyramids', params: { ...typeParams, alpha: transparent ? 0.5 : 1.0 } },
            colorTheme: { name: 'confal-pyramids', params: colorParams }
        };
    }

    static async create(target: HTMLElement) {
        const defaultSpec = DefaultPluginUISpec();
        const spec: PluginUISpec = {
            ...defaultSpec,
            behaviors: [
                PluginSpec.Behavior(ReDNATCOLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(ReDNATCOLociSelectionProvider),
                ...ObjectKeys(Extensions).map(k => Extensions[k]),
            ],
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: 'none',
                    right: 'none',
                    bottom: 'none',
                    left: 'none'
                },
            },
            layout: {
                initial: {
                    isExpanded: false,
                    showControls: false,
                },
            },
        };

        const plugin = await createPluginUI(target, spec);

        plugin.managers.interactivity.setProps({ granularity: 'two-residues' });
        plugin.selectionMode = true;

        return new ReDNATCOMspViewer(plugin);
    }

    async changeRepresentation(display: Partial<Display>) {
        const b = this.plugin.state.data.build();
        const repr = display.representation ?? 'cartoon';

        for (const sub of ['nucleic', 'protein', 'water'] as IDs.Substructure[]) {
            if (this.has('visual', sub)) {
                b.to(IDs.ID('visual', sub, BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            type: { ...old.type, name: repr }
                        })
                    );
            }
        }

        await b.commit();
    }

    has(id: IDs.ID, sub: IDs.Substructure|'' = '', ref = BaseRef) {
        return !!this.plugin.state.data.cells.get(IDs.ID(id, sub, ref))?.obj;
    }

    async loadStructure(data: string, type: 'pdb'|'cif', display: Partial<Display>) {
        await this.plugin.state.data.build().toRoot().commit();

        const b = (t => type === 'pdb'
            ? t.apply(StateTransforms.Model.TrajectoryFromPDB)
            : t.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif)
        )(this.plugin.state.data.build().toRoot().apply(RawData, { data }, { ref: IDs.ID('data', '', BaseRef) }))
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 })
            .apply(StateTransforms.Model.StructureFromModel, {}, { ref: IDs.ID('structure', '', BaseRef) })
            // Extract substructures
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'nucleic' }, { ref: IDs.ID('structure', 'nucleic', BaseRef) })
            .to(IDs.ID('structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'protein' }, { ref: IDs.ID('structure', 'protein', BaseRef) })
            .to(IDs.ID('structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { ref: IDs.ID('structure', 'water', BaseRef) });
        // Commit now so that we can check whether individual substructures are available
        await b.commit();

        // Create default visuals
        const bb = this.plugin.state.data.build();
        if (display.showNucleic && this.has('structure', 'nucleic')) {
            bb.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    {
                        type: { name: display.representation ?? 'cartoon', params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false } },
                    },
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
            if (display.showPyramids) {
                bb.to(IDs.ID('structure', 'nucleic', BaseRef))
                    .apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.pyramidsParams(new Map(), new Map(), false),
                        { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                    );
            }
        }
        if (display.showProtein && this.has('structure', 'protein')) {
            bb.to(IDs.ID('structure', 'protein', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    {
                        type: { name: display.representation ?? 'cartoon', params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false } },
                    },
                    { ref: IDs.ID('visual', 'protein', BaseRef) }
                );
        }
        if (display.showWater && this.has('structure', 'water')) {
            bb.to(IDs.ID('structure', 'water', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    {
                        type: { name: display.representation ?? 'ball-and-stick', params: { sizeFactor: 0.2, sizeAspectRatio: 0.35 } },
                    },
                    { ref: IDs.ID('visual', 'water', BaseRef) }
                );
        }

        await bb.commit();
    }

    isReady() {
        return this.has('structure', '', BaseRef);
    }

    async togglePyramids(display: Partial<Display>) {
        if (display.showPyramids && !this.has('pyramids', 'nucleic')) {
            const b = this.getBuilder('structure', 'nucleic');
            if (b) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.pyramidsParams(new Map(), new Map(), false),
                    { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                );
                await b.commit();
            }
        } else {
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('pyramids', 'nucleic', BaseRef) });
        }
    }

    async toggleSubstructure(sub: IDs.Substructure, display: Partial<Display>) {
        const show = sub === 'nucleic' ? !!display.showNucleic :
            sub === 'protein' ? !!display.showProtein : !!display.showWater;
        const repr = display.representation ?? 'cartoon';

        if (show) {
            const b = this.getBuilder('structure', sub);
            if (b) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    {
                        type: { name: repr, params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false } }, // TODO: Use different params for water
                    },
                    { ref: IDs.ID('visual', sub, BaseRef) }
                );
                await b.commit();
            }
        } else
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('visual', sub, BaseRef) });
    }
}

interface State {
    display: Display;
}
class ReDNATCOMsp extends React.Component<ReDNATCOMsp.Props, State> {
    private viewer: ReDNATCOMspViewer|null = null;

    constructor(props: ReDNATCOMsp.Props) {
        super(props);

        this.state = {
            display: { ...Display },
        };
    }

    loadStructure(data: string, type: 'pdb'|'cif') {
        if (this.viewer)
            this.viewer.loadStructure(data, type, this.state.display).then(() => this.forceUpdate());
    }

    componentDidMount() {
        if (!this.viewer) {
            const elem = document.getElementById(this.props.elemId + '-viewer');
            ReDNATCOMspViewer.create(elem!).then(viewer => {
                this.viewer = viewer;
                ReDNATCOMspApi.bind(this);

                if (this.props.onInited)
                    this.props.onInited();
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
                <div>
                    <div>Display and control</div>
                    <div className='rmsp-controls'>
                        <div className='rmsp-controls-section-caption'>Representation</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item'>
                                <PushButton
                                    caption={capitalize(this.state.display.representation)}
                                    enabled={ready}
                                    onClick={() => {
                                        const display = {
                                            ...this.state.display,
                                            representation: this.state.display.representation === 'cartoon' ? 'ball-and-stick' : 'cartoon',
                                        };
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
                                    caption='Nucleic'
                                    enabled={hasNucleic}
                                    switchedOn={this.state.display.showNucleic}
                                    onClick={() => {
                                        const display = {
                                            ...this.state.display,
                                            showNucleic: !this.state.display.showNucleic,
                                        };
                                        this.viewer!.toggleSubstructure('nucleic', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    caption='Protein'
                                    enabled={hasProtein}
                                    switchedOn={this.state.display.showProtein}
                                    onClick={() => {
                                        const display = {
                                            ...this.state.display,
                                            showProtein: !this.state.display.showProtein,
                                        };
                                        this.viewer!.toggleSubstructure('protein', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    caption='Water'
                                    enabled={hasWater}
                                    switchedOn={this.state.display.showWater}
                                    onClick={() => {
                                        const display = {
                                            ...this.state.display,
                                            showWater: !this.state.display.showWater,
                                        };
                                        this.viewer!.toggleSubstructure('water', display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                        </div>

                        <div className='rmsp-controls-section-caption'>NtC visuals</div>
                        <div className='rmsp-controls-line'>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    caption='Pyramids'
                                    enabled={ready}
                                    switchedOn={this.state.display.showPyramids}
                                    onClick={() => {
                                        const display = {
                                            ...this.state.display,
                                            pyramidsShown: !this.state.display.showPyramids,
                                        };
                                        this.viewer!.togglePyramids(display);
                                        this.setState({ ...this.state, display });
                                    }}
                                />
                            </div>
                            <div className='rmsp-control-item'>
                                <ToggleButton
                                    caption='Balls'
                                    enabled={false}
                                    switchedOn={false}
                                    onClick={() => {}}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

namespace ReDNATCOMsp {
    export interface Props {
        elemId: string;
        onInited?: () => void;
    }

    export function init(elemId: string, onInited?: () => void) {
        const elem = document.getElementById(elemId);
        if (!elem)
            throw new Error(`Element ${elemId} does not exist`);

        ReactDOM.render(<ReDNATCOMsp elemId={elemId} onInited={onInited} />, elem);
    }
}

class _ReDNATCOMspApi {
    private target: ReDNATCOMsp|null = null;

    private check() {
        if (!this.target)
            throw new Error('ReDNATCOMsp object not bound');
    }

    bind(target: ReDNATCOMsp) {
        this.target = target;
    }

    init(elemId: string, onInited?: () => void) {
        ReDNATCOMsp.init(elemId, onInited);
    }

    loadStructure(data: string) {
        this.check();
        this.target!.loadStructure(data, 'cif');
    }
}

export const ReDNATCOMspApi = new _ReDNATCOMspApi();
