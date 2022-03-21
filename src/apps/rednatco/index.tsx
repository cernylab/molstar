import React from 'react';
import ReactDOM from 'react-dom';
import { NtCColors } from './colors';
import { ColorPicker } from './color-picker';
import { Commands } from './commands';
import { PushButton, ToggleButton } from './controls';
import * as IDs from './idents';
import * as RefCfmr from './reference-conformers';
import { ReferenceConformersPdbs } from './reference-conformers-pdbs';
import { Step } from './step';
import { Superpose } from './superpose';
import { Traverse } from './traverse';
import { DnatcoConfalPyramids } from '../../extensions/dnatco';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { BoundaryHelper } from '../../mol-math/geometry/boundary-helper';
import { Loci } from '../../mol-model/loci';
import { Model, Structure, StructureElement, StructureProperties, StructureSelection, Trajectory } from '../../mol-model/structure';
import { Location } from '../../mol-model/structure/structure/element/location';
import { MmcifFormat } from '../../mol-model-formats/structure/mmcif';
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
import { StateObjectCell, StateObject, StateSelection } from '../../mol-state';
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

const AnimationDurationMsec = 150;
const BaseRef = 'rdo';
const RCRef = 'rc';
const NtCSupPrev = 'ntc-sup-prev';
const NtCSupSel = 'ntc-sup-sel';
const NtCSupNext = 'ntc-sup-next';

const SphereBoundaryHelper = new BoundaryHelper('98');

type StepInfo = {
    name: string;
    assignedNtC: string;
    closestNtC: string; // Fallback for cases where assignedNtC is NANT
}

function capitalize(s: string) {
    if (s.length === 0)
        return s;
    return s[0].toLocaleUpperCase() + s.slice(1);

}

function dinucleotideBackbone(loci: StructureElement.Loci) {
    const es = loci.elements[0];
    const loc = Location.create(loci.structure, es.unit, es.unit.elements[OrderedSet.getAt(es.indices, 0)]);
    const len = OrderedSet.size(es.indices);
    const indices = [];

    // Find split between first and second residue
    const resNo1 = StructureProperties.residue.auth_seq_id(loc);
    let secondIdx = -1;
    for (let idx = 0; idx < len; idx++) {
        loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
        const resNo = StructureProperties.residue.auth_seq_id(loc);
        if (resNo !== resNo1) {
            secondIdx = idx;
            break;
        }
    }
    if (secondIdx === -1)
        return [];

    // Gather ElementIndices for backbone atoms of the first  residue
    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, 0)];
    const comp1 = StructureProperties.atom.label_comp_id(loc);
    const ring1 = RefCfmr.CompoundRings[comp1 as keyof RefCfmr.CompoundRings];
    if (!ring1)
        return [];

    const first = RefCfmr.BackboneAtoms.first.concat(RefCfmr.BackboneAtoms[ring1]);
    for (const atom of first) {
        let idx = 0;
        for (; idx < secondIdx; idx++) {
            loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
            const _atom = StructureProperties.atom.label_atom_id(loc);
            if (atom === _atom) {
                indices.push(loc.element);
                break;
            }
        }
        if (idx === secondIdx) {
            console.error(`Cannot find backbone atom ${atom} in first residue of a step`);
            return [];
        }
    }

    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, secondIdx)];
    const comp2 = StructureProperties.atom.label_comp_id(loc);
    const ring2 = RefCfmr.CompoundRings[comp2 as keyof RefCfmr.CompoundRings];
    if (!ring2)
        return [];

    const second = RefCfmr.BackboneAtoms.second.concat(RefCfmr.BackboneAtoms[ring2]);
    for (const atom of second) {
        let idx = secondIdx;
        for (; idx < len; idx++) {
            loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
            const _atom = StructureProperties.atom.label_atom_id(loc);
            if (atom === _atom) {
                indices.push(loc.element);
                break;
            }
        }
        if (idx === len) {
            console.error(`Cannot find backbone atom ${atom} in second residue of a step`);
            return [];
        }
    }

    return indices;
}

function rcref(c: string, where: 'sel'|'prev'|'next'|'' = '') {
    return `${RCRef}-${c}-${where}`;
}

class ColorBox extends React.Component<{ caption: string, color: Color }> {
    render() {
        return (
            <div className='rmsp-color-box'>
                <div className='rmsp-color-box-caption'>{this.props.caption}</div>
                <div
                    className='rmsp-color-box-color'
                    style={{ backgroundColor: Color.toStyle(this.props.color) }}
                />
            </div>
        );
    }
}

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

type VisualRepresentations = 'ball-and-stick'|'cartoon';
const Display = {
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
    clickSelectOnly: Binding([Binding.Trigger(ButtonsType.Flag.Primary)], 'Select the clicked element using ${triggers}.'),
    clickDeselectAllOnEmpty: Binding([Binding.Trigger(ButtonsType.Flag.Primary)], 'Deselect all when clicking on nothing using ${triggers}.'),
};
const ReDNATCOLociSelectionParams = {
    bindings: PD.Value(ReDNATCOLociSelectionBindings, { isHidden: true }),
    onDeselected: PD.Value(() => {}, { isHidden: true }),
    onSelected: PD.Value((loci: Representation.Loci) => {}, { isHidden: true }),
};
type ReDNATCOLociSelectionProps = PD.Values<typeof ReDNATCOLociSelectionParams>;

const ReDNATCOLociSelectionProvider = PluginBehavior.create({
    name: 'rednatco-loci-selection-provider',
    category: 'interaction',
    display: { name: 'Interactive step selection' },
    params: () => ReDNATCOLociSelectionParams,
    ctor: class extends PluginBehavior.Handler<ReDNATCOLociSelectionProps> {
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
                [
                    'clickDeselectAllOnEmpty',
                    () => {
                        this.ctx.managers.interactivity.lociSelects.deselectAll();
                        this.params.onDeselected();
                    },
                    lociIsEmpty
                ],
                [
                    'clickSelectOnly',
                    current => {
                        this.ctx.managers.interactivity.lociSelects.deselectAll();
                        if (current.loci.kind === 'element-loci') {
                            this.ctx.managers.interactivity.lociSelects.select(current);
                            this.params.onSelected(current);
                        }
                    },
                    lociIsNotEmpty
                ],
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
        constructor(ctx: PluginContext, params: ReDNATCOLociSelectionProps) {
            super(ctx, params);
            this.spine = new StateTreeSpine.Impl(ctx.state.data.cells);
        }
    },
});

class ReDNATCOMspViewer {
    private haveMultipleModels = false;
    private steps: StepInfo[] = [];
    private stepNames: Map<string, number> = new Map();

    constructor(public plugin: PluginUIContext, interactionContext: { self?: ReDNATCOMspViewer }) {
        interactionContext.self = this;
    }

    private currentModelNumber() {
        const model = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!model)
            return -1;
        return (model as StateObject<Model>).data.modelNum;
    }

    private getBuilder(id: IDs.ID, sub: IDs.Substructure|'' = '', ref = BaseRef) {
        return this.plugin.state.data.build().to(IDs.ID(id, sub, ref));
    }

    private getStructureParent(cell: StateObjectCell) {
        if (!cell.sourceRef)
            return undefined;
        const parent = this.plugin.state.data.cells.get(cell.sourceRef);
        if (!parent)
            return undefined;
        return parent.obj?.type.name === 'Structure' ? parent.obj : undefined;
    }

    private ntcRef(id: number|undefined, where: 'sel'|'prev'|'next') {
        if (id === undefined)
            return undefined;
        const info = this.steps[id];
        return rcref(info.assignedNtC === 'NANT' ? info.closestNtC : info.assignedNtC, where);
    }

    private pyramidsParams(colors: NtCColors.Conformers, visible: Map<string, boolean>, transparent: boolean) {
        const typeParams = {} as PD.Values<ConfalPyramidsParams>;
        for (const k of Reflect.ownKeys(ConfalPyramidsParams) as (keyof ConfalPyramidsParams)[]) {
            if (ConfalPyramidsParams[k].type === 'boolean')
                (typeParams[k] as any) = visible.get(k) ?? ConfalPyramidsParams[k]['defaultValue'];
        }

        return {
            type: { name: 'confal-pyramids', params: { ...typeParams, alpha: transparent ? 0.5 : 1.0 } },
            colorTheme: {
                name: 'confal-pyramids',
                params: {
                    colors: {
                        name: 'custom',
                        params: colors,
                    },
                },
            },
        };
    }

    private resetCameraRadius() {
        if (!this.plugin.canvas3d)
            return;

        const spheres = [];
        for (const [ref, cell] of Array.from(this.plugin.state.data.cells)) {
            if (!IDs.isVisual(ref))
                continue;
            const parent = this.getStructureParent(cell);
            if (parent) {
                const loci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(parent.data, parent.data));
                const s = Loci.getBoundingSphere(loci);
                if (s)
                    spheres.push(s);
            }
        }

        if (spheres.length === 0)
            return;

        SphereBoundaryHelper.reset();
        for (const s of spheres)
            SphereBoundaryHelper.includePositionRadius(s.center, s.radius);
        SphereBoundaryHelper.finishedIncludeStep();
        for (const s of spheres)
            SphereBoundaryHelper.radiusPositionRadius(s.center, s.radius);
        const bs = SphereBoundaryHelper.getSphere();

        const snapshot = this.plugin.canvas3d.camera.getSnapshot();
        snapshot.radius = bs.radius;
        snapshot.target = bs.center;
        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
    }

    private substructureVisuals(representation: 'ball-and-stick'|'cartoon') {
        switch (representation) {
            case 'cartoon':
                return {
                    type: {
                        name: 'cartoon',
                        params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
                    },
                    colorTheme: { name: 'chain-id', params: { asymId: 'auth' } },
                };
            case 'ball-and-stick':
                return {
                    type: {
                        name: 'ball-and-stick',
                        params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
                    },
                    colorTheme: { name: 'element-symbol', params: { carbonColor: 'chain-id' } },
                };
        }
    }

    private superpose(reference: StructureElement.Loci, stru: StructureElement.Loci) {
        const refElems = dinucleotideBackbone(reference);
        const struElems = dinucleotideBackbone(stru);

        return Superpose.superposition(
            { elements: refElems, conformation: reference.elements[0].unit.conformation },
            { elements: struElems, conformation: stru.elements[0].unit.conformation }
        );
    }

    static async create(target: HTMLElement) {
        const interactCtx: { self?: ReDNATCOMspViewer } = { self: undefined };
        const defaultSpec = DefaultPluginUISpec();
        const spec: PluginUISpec = {
            ...defaultSpec,
            behaviors: [
                PluginSpec.Behavior(ReDNATCOLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(
                    ReDNATCOLociSelectionProvider,
                    {
                        bindings: ReDNATCOLociSelectionBindings,
                        onDeselected: () => interactCtx.self!.onDeselected(),
                        onSelected: (loci) => interactCtx.self!.onLociSelected(loci),
                    }
                ),
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

        return new ReDNATCOMspViewer(plugin, interactCtx);
    }

    async changeNtCColors(display: Partial<Display>) {
        if (!this.has('pyramids', 'nucleic'))
            return;

        const b = this.plugin.state.data.build().to(IDs.ID('pyramids', 'nucleic', BaseRef));
        b.update(
            StateTransforms.Representation.StructureRepresentation3D,
            old => ({
                ...old,
                colorTheme: {
                    name: 'confal-pyramids',
                    params: {
                        colors: {
                            name: 'custom',
                            params: display.conformerColors ?? NtCColors.Conformers,
                        },
                    },
                },
            })
        );

        await b.commit();
    }

    async changePyramids(display: Partial<Display>) {
        if (display.showPyramids) {
            if (!this.has('pyramids', 'nucleic')) {
                const b = this.getBuilder('structure', 'nucleic');
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.pyramidsParams(display.conformerColors ?? NtCColors.Conformers, new Map(), display.pyramidsTransparent ?? false),
                        { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                    );
                    await b.commit();
                }
            } else {
                const b = this.getBuilder('pyramids', 'nucleic');
                b.update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.pyramidsParams(display.conformerColors ?? NtCColors.Conformers, new Map(), display.pyramidsTransparent ?? false),
                    })
                );
                await b.commit();
            }
        } else
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('pyramids', 'nucleic', BaseRef) });
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
                            ...this.substructureVisuals(repr),
                        })
                    );
            }
        }

        await b.commit();
    }

    gatherNtCInfo(): { steps: StepInfo[], stepNames: Map<string, number> }|undefined {
        const obj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!obj)
            return void 0;
        const model = (obj as StateObject<Model>);
        const sourceData = model.data.sourceData;
        if (!MmcifFormat.is(sourceData))
            return void 0;

        const tableSum = sourceData.data.frame.categories['ndb_struct_ntc_step_summary'];
        const tableStep = sourceData.data.frame.categories['ndb_struct_ntc_step'];
        if (!tableSum || !tableStep) {
            console.warn('NtC information not present');
            return void 0;
        }

        const _ids = tableStep.getField('id');
        const _names = tableStep.getField('name');
        const _stepIds = tableSum.getField('step_id');
        const _assignedNtCs = tableSum.getField('assigned_NtC');
        const _closestNtCs = tableSum.getField('closest_NtC');
        if (!_ids || !_names || !_stepIds || !_assignedNtCs || !_closestNtCs) {
            console.warn('Expected fields are not present in NtC categories');
            return void 0;
        }

        const ids = _ids.toIntArray();
        const names = _names.toStringArray();
        const stepIds = _stepIds.toIntArray();
        const assignedNtCs = _assignedNtCs.toStringArray();
        const closestNtCs = _closestNtCs.toStringArray();
        const len = ids.length;

        const stepNames = new Map<string, number>();
        const steps = new Array<StepInfo>(len);

        for (let idx = 0; idx < len; idx++) {
            const id = ids[idx];
            const name = names[idx];
            for (let jdx = 0; jdx < len; jdx++) {
                if (stepIds[jdx] === id) {
                    const assignedNtC = assignedNtCs[jdx];
                    const closestNtC = closestNtCs[jdx];

                    // We're assuming that steps are ID'd with a contigious, monotonic sequence starting from 1
                    steps[id - 1] = { name, assignedNtC, closestNtC };
                    stepNames.set(name, id - 1);
                    break;
                }
            }
        }

        return { steps, stepNames };
    }

    getModelCount() {
        const obj = this.plugin.state.data.cells.get(IDs.ID('trajectory', '', BaseRef))?.obj;
        if (!obj)
            return 0;
        return (obj as StateObject<Trajectory>).data.frameCount;
    }

    getPresentConformers() {
        const obj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!obj)
            return [];
        const model = (obj as StateObject<Model>);
        const modelNum = model.data.modelNum;
        const sourceData = model.data.sourceData;
        if (MmcifFormat.is(sourceData)) {
            const tableSum = sourceData.data.frame.categories['ndb_struct_ntc_step_summary'];
            const tableStep = sourceData.data.frame.categories['ndb_struct_ntc_step'];
            if (!tableSum || !tableStep) {
                console.warn('NtC information not present');
                return [];
            }

            const _stepIds = tableSum.getField('step_id');
            const _assignedNtCs = tableSum.getField('assigned_NtC');
            const _ids = tableStep.getField('id');
            const _modelNos = tableStep.getField('PDB_model_number');
            if (!_stepIds || !_assignedNtCs || !_ids || !_modelNos) {
                console.warn('Expected fields are not present in NtC categories');
                return [];
            }

            const stepIds = _stepIds.toIntArray();
            const assignedNtCs = _assignedNtCs.toStringArray();
            const ids = _ids.toIntArray();
            const modelNos = _modelNos.toIntArray();

            const present = new Array<string>();
            for (let row = 0; row < stepIds.length; row++) {
                const idx = ids.indexOf(stepIds[row]);
                if (modelNos[idx] === modelNum) {
                    const ntc = assignedNtCs[row];
                    if (!present.includes(ntc))
                        present.push(ntc);
                }
            }

            present.sort();
            return present;
        }
        return [];
    }

    has(id: IDs.ID, sub: IDs.Substructure|'' = '', ref = BaseRef) {
        return !!this.plugin.state.data.cells.get(IDs.ID(id, sub, ref))?.obj;
    }

    isReady() {
        return this.has('structure', '', BaseRef);
    }

    async loadStructure(data: string, type: 'pdb'|'cif', display: Partial<Display>) {
        // TODO: Remove the currently loaded structure

        const b = (t => type === 'pdb'
            ? t.apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
            : t.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
        )(this.plugin.state.data.build().toRoot().apply(RawData, { data }, { ref: IDs.ID('data', '', BaseRef) }))
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: display.modelNumber ? display.modelNumber - 1 : 0 }, { ref: IDs.ID('model', '', BaseRef) })
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
                    this.substructureVisuals('cartoon'),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
            if (display.showPyramids) {
                bb.to(IDs.ID('structure', 'nucleic', BaseRef))
                    .apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.pyramidsParams(display.conformerColors ?? NtCColors.Conformers, new Map(), false),
                        { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                    );
            }
        }
        if (display.showProtein && this.has('structure', 'protein')) {
            bb.to(IDs.ID('structure', 'protein', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals('cartoon'),
                    { ref: IDs.ID('visual', 'protein', BaseRef) }
                );
        }
        if (display.showWater && this.has('structure', 'water')) {
            bb.to(IDs.ID('structure', 'water', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals('ball-and-stick'),
                    { ref: IDs.ID('visual', 'water', BaseRef) }
                );
        }

        await bb.commit();

        this.haveMultipleModels = this.getModelCount() > 1;

        const ntcInfo = this.gatherNtCInfo();
        if (!ntcInfo) {
            this.steps.length = 0;
            this.stepNames.clear();
        } else {
            this.steps = ntcInfo.steps;
            this.stepNames = ntcInfo.stepNames;
        }
    }

    async loadReferenceConformers() {
        const b = this.plugin.state.data.build().toRoot();

        for (const c in ReferenceConformersPdbs) {
            const cfmr = ReferenceConformersPdbs[c as keyof typeof ReferenceConformersPdbs];
            const bRef = rcref(c);
            const mRef = IDs.ID('model', '', bRef);
            b.toRoot();
            b.apply(RawData, { data: cfmr }, { ref: IDs.ID('data', '', bRef) })
                .apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: IDs.ID('trajectory', '', bRef) })
                .apply(StateTransforms.Model.ModelFromTrajectory, {}, { ref: mRef })
                .apply(StateTransforms.Model.StructureFromModel, {}, { ref: IDs.ID('structure', '', rcref(c, 'sel')) })
                .to(mRef)
                .apply(StateTransforms.Model.StructureFromModel, {}, { ref: IDs.ID('structure', '', rcref(c, 'prev')) })
                .to(mRef)
                .apply(StateTransforms.Model.StructureFromModel, {}, { ref: IDs.ID('structure', '', rcref(c, 'next')) });
        }

        await b.commit();
    }

    onDeselected() {
        this.plugin.state.data.build()
            .delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext))
            .commit();
    }

    onLociSelected(selected: Representation.Loci) {
        const loci = Loci.normalize(selected.loci, 'two-residues');

        if (loci.kind === 'element-loci') {
            // TODO: This cannot call superposeReferences directly
            // Instead, we must make a callback via the API
            // and have the listener decide what to do with this event
            const stepDesc = Step.describe(loci);
            if (!stepDesc)
                return;
            const stepName = Step.name(stepDesc, this.haveMultipleModels);
            this.superposeReferences(stepName, '', []);
        }
    }

    async switchModel(display: Partial<Display>) {
        if (display.modelNumber && display.modelNumber === this.currentModelNumber())
            return;

        const b = this.plugin.state.data.build()
            .delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext))
            .to(IDs.ID('model', '', BaseRef))
            .update(
                StateTransforms.Model.ModelFromTrajectory,
                old => ({
                    ...old,
                    modelIndex: display.modelNumber ? display.modelNumber - 1 : 0
                })
            );

        await b.commit();
    }

    async superposeReferences(stepName: string, referenceNtc: string, references: ('sel'|'prev'|'next')[]) {
        const ReferenceVisuals = (color: number) => {
            return {
                type: { name: 'ball-and-stick', params: { sizeFactor: 0.15, aromaticBonds: false } },
                colorTheme: { name: 'uniform', params: { value: Color(color) } },
            };
        };

        const stepDesc = Step.fromName(stepName);
        if (!stepDesc)
            return;
        const stepId = this.stepNames.get(stepName);
        if (stepId === undefined) {
            console.error(`Unknown step name ${stepName}`);
            return;
        }

        if (stepDesc.model !== this.currentModelNumber()) {
            const b = this.getBuilder('model')
                .update(
                    StateTransforms.Model.ModelFromTrajectory,
                    old => ({
                        ...old,
                        modelIndex: stepDesc.model - 1,
                    })
                );
            await b.commit();
        }

        const entireStru = this.plugin.state.data.cells.get(IDs.ID('structure', 'nucleic', BaseRef))!.obj!;
        const loci = Traverse.findResidue(
            stepDesc.chain,
            stepDesc.resNo1,
            stepDesc.altId1,
            StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(entireStru.data, entireStru.data)),
            'auth'
        );
        if (loci.kind !== 'element-loci')
            return;
        const selLoci = Loci.normalize(loci, 'two-residues');
        if (selLoci.kind !== 'element-loci')
            return;

        const stepIdPrev = stepId === 0 ? void 0 : stepId - 1;
        const stepIdNext = stepId === this.steps.length - 1 ? void 0 : stepId + 1;

        const ntcRefSel = this.ntcRef(stepId, 'sel');
        const ntcRefPrev = this.ntcRef(stepIdPrev, 'prev');
        const ntcRefNext = this.ntcRef(stepIdNext, 'next');

        if (!ntcRefSel) {
            console.error(`stepId ${stepId} does not map to a known step`);
            return;
        }

        const b = this.plugin.state.data.build()
            .delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext));

        const addReference = (ntcRef: string, superposRef: string, loci: Loci, color: number) => {
            const refStru = this.plugin.state.data.cells.get(IDs.ID('structure', '', ntcRef))!.obj!;
            const refLoci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(refStru.data, refStru.data));

            if (loci.kind === 'element-loci' && Step.is(loci)) {
                const { bTransform, rmsd } = this.superpose(refLoci, loci);
                if (isNaN(bTransform[0])) {
                    console.error(`Cannot superpose reference conformer ${ntcRef} onto selection`);
                    return;
                }
                b.to(IDs.ID('structure', '', ntcRef))
                    .apply(
                        StateTransforms.Model.TransformStructureConformation,
                        { transform: { name: 'matrix', params: { data: bTransform, transpose: false } } },
                        { ref: IDs.ID('superposition', '', superposRef) }
                    ).apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        ReferenceVisuals(color),
                        { ref: IDs.ID('visual', '', superposRef) }
                    );
                return rmsd;
            }
        };

        const rmsd = addReference(ntcRefSel, NtCSupSel, selLoci, 0x008000);
        if (ntcRefPrev)
            addReference(ntcRefPrev, NtCSupPrev, Loci.normalize(Traverse.residue(-1, stepDesc.altId1, selLoci), 'two-residues'), 0x0000FF);
        if (ntcRefNext)
            addReference(ntcRefNext, NtCSupNext, Loci.normalize(Traverse.residue(1, stepDesc.altId2, selLoci), 'two-residues'), 0x00FFFF);

        b.commit();

        return rmsd;
    }

    async toggleSubstructure(sub: IDs.Substructure, display: Partial<Display>) {
        const show = sub === 'nucleic' ? !!display.showNucleic :
            sub === 'protein' ? !!display.showProtein : !!display.showWater;
        const repr = display.representation ?? 'cartoon';

        if (show) {
            const b = this.getBuilder('structure', sub);
            const visuals = this.substructureVisuals(sub === 'water' ? 'ball-and-stick' : repr);
            if (b) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    visuals,
                    { ref: IDs.ID('visual', sub, BaseRef) }
                );
                await b.commit();
            }
        } else {
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('visual', sub, BaseRef) });
            this.resetCameraRadius();
        }
    }
}

interface State {
    display: Display;
    showControls: boolean;
}
class ReDNATCOMsp extends React.Component<ReDNATCOMsp.Props, State> {
    private presentConformers: string[] = [];
    private viewer: ReDNATCOMspViewer|null = null;

    private classColorToConformers(k: keyof ConformersByClass, color: Color) {
        const updated: Partial<NtCColors.Conformers> = {};
        ConformersByClass[k].map(cfmr => updated[cfmr as keyof NtCColors.Conformers] = color);

        return updated;
    }

    private updateClassColor(k: keyof NtCColors.Classes, color: number) {
        const clr = Color(color);
        const classColors = { ...this.state.display.classColors };
        classColors[k] = clr;

        const conformerColors = {
            ...this.state.display.conformerColors,
            ...this.classColorToConformers(k as keyof ConformersByClass, clr),
        };

        const display = { ...this.state.display, classColors, conformerColors };
        this.viewer!.changeNtCColors(display);
        this.setState({ ...this.state, display });
    }

    private updateConformerColor(k: keyof NtCColors.Conformers, color: number) {
        const conformerColors = { ...this.state.display.conformerColors };
        conformerColors[k] = Color(color);

        const display = { ...this.state.display, conformerColors };
        this.viewer!.changeNtCColors(display);
        this.setState({ ...this.state, display });
    }

    command(cmd: Commands.Cmd) {
        if (!this.viewer)
            return;

        if (cmd.type === 'select-step') {
            this.viewer.superposeReferences(cmd.stepName, cmd.referenceNtC, cmd.references);
        } else if (cmd.type === 'switch-model') {
            if (cmd.model < 1 || cmd.model > this.viewer.getModelCount())
                return;

            const display: Display = {
                ...this.state.display,
                modelNumber: cmd.model,
            };

            this.viewer.switchModel(display);
            this.setState({ ...this.state, display });
        }
    }

    constructor(props: ReDNATCOMsp.Props) {
        super(props);

        this.state = {
            display: { ...Display },
            showControls: false,
        };
    }

    loadStructure(data: string, type: 'pdb'|'cif') {
        if (this.viewer)
            this.viewer.loadStructure(data, type, this.state.display).then(() => {
                this.presentConformers = this.viewer!.getPresentConformers();
                this.forceUpdate();
            });
    }

    componentDidMount() {
        if (!this.viewer) {
            const elem = document.getElementById(this.props.elemId + '-viewer');
            ReDNATCOMspViewer.create(elem!).then(viewer => {
                this.viewer = viewer;
                this.viewer.loadReferenceConformers().then(() => {
                    ReDNATCOMspApi._bind(this);

                    if (this.props.onInited)
                        this.props.onInited();
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
                <div>
                    <div
                        onClick={() => this.setState({ ...this.state, showControls: !this.state.showControls })}
                    >
                        Display and control
                    </div>
                    {this.state.showControls ?
                        <div className='rmsp-controls'>
                            <div className='rmsp-controls-section-caption'>Representation</div>
                            <div className='rmsp-controls-line'>
                                <div className='rmsp-control-item'>
                                    <PushButton
                                        text={capitalize(this.state.display.representation)}
                                        enabled={ready}
                                        onClick={() => {
                                            const display: Display = {
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
                                        text='Nucleic'
                                        enabled={hasNucleic}
                                        switchedOn={this.state.display.showNucleic}
                                        onClick={() => {
                                            const display: Display = {
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
                                        text='Protein'
                                        enabled={hasProtein}
                                        switchedOn={this.state.display.showProtein}
                                        onClick={() => {
                                            const display: Display = {
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
                                        text='Water'
                                        enabled={hasWater}
                                        switchedOn={this.state.display.showWater}
                                        onClick={() => {
                                            const display: Display = {
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
                                <div className='rmsp-control-item-group'>
                                    <div className='rmsp-control-item'>
                                        <ToggleButton
                                            text='Pyramids'
                                            enabled={ready}
                                            switchedOn={this.state.display.showPyramids}
                                            onClick={() => {
                                                const display: Display = {
                                                    ...this.state.display,
                                                    showPyramids: !this.state.display.showPyramids,
                                                };
                                                this.viewer!.changePyramids(display);
                                                this.setState({ ...this.state, display });
                                            }}
                                        />
                                    </div>
                                    <div className='rmsp-control-item'>
                                        <PushButton
                                            text={this.state.display.pyramidsTransparent ? 'Transparent' : 'Solid'}
                                            enabled={this.state.display.showPyramids}
                                            onClick={() => {
                                                const display: Display = {
                                                    ...this.state.display,
                                                    pyramidsTransparent: !this.state.display.pyramidsTransparent,
                                                };
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
                                            text={this.state.display.ballsTransparent ? 'Transparent' : 'Solid'}
                                            enabled={this.state.display.showBalls}
                                            onClick={() => {
                                                const display: Display = {
                                                    ...this.state.display,
                                                    ballsTransparent: !this.state.display.ballsTransparent,
                                                };
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
                                                this.state.display.classColors[k],
                                                color => this.updateClassColor(k, color)
                                            )}
                                        >
                                            <ColorBox caption={k} color={this.state.display.classColors[k]} />
                                        </div>
                                        <PushButton
                                            text='R'
                                            onClick={() => this.updateClassColor(k, NtCColors.Classes[k])}
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
                                                        this.state.display.conformerColors[uprKey],
                                                        color => this.updateConformerColor(uprKey, color)
                                                    )}
                                                >
                                                    <ColorBox caption={`${ntc} Upr`} color={this.state.display.conformerColors[uprKey]} />
                                                </div>
                                                <PushButton
                                                    text='R'
                                                    onClick={() => this.updateConformerColor(uprKey, NtCColors.Conformers[uprKey])}
                                                    enabled={true}
                                                />
                                            </div>
                                            <div className='rmsp-control-item-group'>
                                                <div
                                                    className='rmsp-control-item'
                                                    onClick={evt => ColorPicker.create(
                                                        evt,
                                                        this.state.display.conformerColors[lwrKey],
                                                        color => this.updateConformerColor(lwrKey, color)
                                                    )}
                                                >
                                                    <ColorBox caption={`${ntc} Lwr`} color={this.state.display.conformerColors[lwrKey]} />
                                                </div>
                                                <PushButton
                                                    text='R'
                                                    onClick={() => this.updateConformerColor(lwrKey, NtCColors.Conformers[lwrKey])}
                                                    enabled={true}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        : undefined
                    }
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

    _bind(target: ReDNATCOMsp) {
        this.target = target;
    }

    command(cmd: Commands.Cmd) {
        this.check();
        this.target!.command(cmd);
    }

    init(elemId: string, onInited?: () => void) {
        ReDNATCOMsp.init(elemId, onInited);
        return this;
    }

    loadStructure(data: string) {
        this.check();
        this.target!.loadStructure(data, 'cif');
    }
}

export const ReDNATCOMspApi = new _ReDNATCOMspApi();
