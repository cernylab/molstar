import * as IDs from './idents';
import * as RefCfmr from './reference-conformers';
import { ReDNATCOMsp, Display, VisualRepresentations } from './index';
import { NtCColors } from './colors';
import { ReferenceConformersPdbs } from './reference-conformers-pdbs';
import { Step } from './step';
import { Superpose } from './superpose';
import { Traverse } from './traverse';
import { DnatcoConfalPyramids } from '../../extensions/dnatco';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { BoundaryHelper } from '../../mol-math/geometry/boundary-helper';
import { Vec3 } from '../../mol-math/linear-algebra/3d';
import { EmptyLoci, Loci } from '../../mol-model/loci';
import { ElementIndex, Model, StructureElement, StructureProperties, StructureSelection, Trajectory } from '../../mol-model/structure';
import { structureUnion, structureSubtract } from '../../mol-model/structure/query/utils/structure-set';
import { Location } from '../../mol-model/structure/structure/element/location';
import { MmcifFormat } from '../../mol-model-formats/structure/mmcif';
import { PluginBehavior, PluginBehaviors } from '../../mol-plugin/behavior';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginContext } from '../../mol-plugin/context';
import { PluginSpec } from '../../mol-plugin/spec';
import { LociLabel } from '../../mol-plugin-state/manager/loci-label';
import { StateTransforms } from '../../mol-plugin-state/transforms';
import { RawData } from '../../mol-plugin-state/transforms/data';
import { createPluginUI } from '../../mol-plugin-ui';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { Representation } from '../../mol-repr/representation';
import { StateObjectCell, StateObject, StateTransformer } from '../../mol-state';
import { StateBuilder } from '../../mol-state/state/builder';
import { lociLabel } from '../../mol-theme/label';
import { arrayMax } from '../../mol-util/array';
import { Binding } from '../../mol-util/binding';
import { Color } from '../../mol-util/color';
import { ButtonsType, ModifiersKeys } from '../../mol-util/input/input-observer';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { ObjectKeys } from '../../mol-util/type-helpers';
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
    chain: string;
    resNo1: number;
    resNo2: number;
    altId1?: string;
    altId2?: string;
    model: number;
}

type StepWithStructure = {
    step: StepInfo;
    loci: StructureElement.Loci;
}

function dinucleotideBackbone(loci: StructureElement.Loci, altId1?: string, altId2?: string) {
    const es = loci.elements[0];
    const loc = Location.create(loci.structure, es.unit, es.unit.elements[OrderedSet.getAt(es.indices, 0)]);
    const len = OrderedSet.size(es.indices);
    const indices = new Array<ElementIndex>();

    const gather = (atoms: string[], start: number, end: number, altId?: string) => {
        for (const atom of atoms) {
            let idx = start;
            for (; idx < end; idx++) {
                loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
                const _atom = StructureProperties.atom.label_atom_id(loc);
                if (atom === _atom) {
                    if (altId) {
                        const _altId = StructureProperties.atom.label_alt_id(loc);
                        if (_altId !== '' && _altId !== altId)
                            continue;
                    }

                    indices.push(loc.element);
                    break;
                }
            }
            if (idx === end) {
                console.error(`Cannot find backbone atom ${atom} in first residue of a step`);
                return false;
            }
        }

        return true;
    };

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
    const ring1 = RefCfmr.CompoundRings[StructureProperties.atom.label_comp_id(loc) as keyof RefCfmr.CompoundRings];
    if (!ring1)
        return [];

    const first = RefCfmr.BackboneAtoms.first.concat(RefCfmr.BackboneAtoms[ring1]);
    if (!gather(first, 0, secondIdx, altId1))
        return [];

    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, secondIdx)];
    const ring2 = RefCfmr.CompoundRings[StructureProperties.atom.label_comp_id(loc) as keyof RefCfmr.CompoundRings];
    if (!ring2)
        return [];

    const second = RefCfmr.BackboneAtoms.second.concat(RefCfmr.BackboneAtoms[ring2]);
    if (!gather(second, secondIdx, len, altId2))
        return [];

    return indices;
}

function rcref(c: string, where: 'sel'|'prev'|'next'|'' = '') {
    return `${RCRef}-${c}-${where}`;
}

const ReDNATCOLociLabelProvider = PluginBehavior.create({
    name: 'watlas-loci-label-provider',
    category: 'interaction',
    ctor: class implements PluginBehavior<undefined> {
        private f = {
            label: (loci: Loci) => {
                switch (loci.kind) {
                    case 'structure-loci':
                    case 'element-loci':
                    case 'data-loci':
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
        }
        unregister() {
        }
        constructor(ctx: PluginContext, params: ReDNATCOLociSelectionProps) {
            super(ctx, params);
        }
    },
});

export class ReDNATCOMspViewer {
    private haveMultipleModels = false;
    private steps: StepInfo[] = [];
    private stepNames: Map<string, number> = new Map();
    private app: ReDNATCOMsp;

    constructor(public plugin: PluginUIContext, interactionContext: { self?: ReDNATCOMspViewer }, app: ReDNATCOMsp) {
        interactionContext.self = this;
        this.app = app;
    }

    private currentModelNumber() {
        const model = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!model)
            return -1;
        return (model as StateObject<Model>).data.modelNum;
    }

    private focusOnLoci(loci: StructureElement.Loci) {
        if (!this.plugin.canvas3d)
            return;

        const sphere = Loci.getBoundingSphere(loci);
        if (!sphere)
            return;
        const snapshot = this.plugin.canvas3d.camera.getSnapshot();

        const v = Vec3();
        const u = Vec3();
        Vec3.set(v, sphere.center[0], sphere.center[1], sphere.center[2]);
        Vec3.set(u, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        Vec3.sub(u, u, v);
        Vec3.normalize(u, u);
        Vec3.scale(u, u, sphere.radius * 8);
        Vec3.add(v, u, v);

        console.log(
            'Cam',
            'Center', sphere.center,
            'Radius', sphere.radius,
            'Position', v
        );

        snapshot.target = sphere.center;
        snapshot.position = v;

        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
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

    private ntcRef(step: StepInfo, where: 'sel'|'prev'|'next') {
        return rcref(step.assignedNtC === 'NANT' ? step.closestNtC : step.assignedNtC, where);
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

    private stepFromName(name: string) {
        const idx = this.stepNames.get(name);
        if (idx === undefined)
            return undefined;

        return this.steps[idx];
    }

    private substructureVisuals(representation: 'ball-and-stick'|'cartoon', color: Color) {
        switch (representation) {
            case 'cartoon':
                return {
                    type: {
                        name: 'cartoon',
                        params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
                    },
                    colorTheme: { name: 'uniform', params: { value: color } }
                };
            case 'ball-and-stick':
                return {
                    type: {
                        name: 'ball-and-stick',
                        params: {
                            sizeFactor: 0.2,
                            sizeAspectRatio: 0.35,
                            excludeTypes: ['hydrogen-bond', 'aromatic'],
                            aromaticBonds: false,
                        },
                    },
                    colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'custom', params: color } } },
                };
        }
    }

    private superpose(reference: StructureElement.Loci, stru: StructureElement.Loci, altId1?: string, altId2?: string) {
        const refElems = dinucleotideBackbone(reference);
        const struElems = dinucleotideBackbone(stru, altId1, altId2);

        return Superpose.superposition(
            { elements: refElems, conformation: reference.elements[0].unit.conformation },
            { elements: struElems, conformation: stru.elements[0].unit.conformation }
        );
    }

    private async toggleNucleicSubstructure(show: boolean, repr: VisualRepresentations, color: Color) {
        if (this.has('structure', 'remainder-slice', BaseRef)) {
            const b = this.getBuilder('structure', 'remainder-slice');
            if (show) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(repr, color),
                    { ref: IDs.ID('visual', 'remainder-slice', BaseRef) }
                );
            } else
                b.delete(IDs.ID('visual', 'remainder-slice', BaseRef));

            await b.commit();
        } else {
            const b = this.getBuilder('structure', 'nucleic');

            if (show) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(repr, color),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
            } else
                b.delete(IDs.ID('visual', 'nucleic', BaseRef));

            await b.commit();
        }
    }

    private toStepWithStructure(name: string, struLoci: StructureElement.Loci): StepWithStructure|undefined {
        const step = this.stepFromName(name);
        if (!step)
            return void 0;

        const loci = Traverse.findStep(
            step.chain,
            step.resNo1,
            step.altId1,
            struLoci,
            'auth'
        );
        if (loci.kind === 'element-loci')
            return { step, loci };

        return void 0;
    }

    private waterVisuals(color: Color) {
        return {
            type: {
                name: 'ball-and-stick',
                params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
            },
            colorTheme: { name: 'uniform', params: { value: color } },
        };
    }

    static async create(target: HTMLElement, app: ReDNATCOMsp) {
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
                }
            },
            config: [
                [PluginConfig.Viewport.ShowExpand, false],
                [PluginConfig.Viewport.ShowControls, false],
                [PluginConfig.Viewport.ShowSettings, false],
                [PluginConfig.Viewport.ShowTrajectoryControls, false],
                [PluginConfig.Viewport.ShowAnimation, false],
                [PluginConfig.Viewport.ShowSelectionMode, false],
            ]
        };

        const plugin = await createPluginUI(target, spec);

        plugin.managers.interactivity.setProps({ granularity: 'two-residues' });
        plugin.selectionMode = true;

        return new ReDNATCOMspViewer(plugin, interactCtx, app);
    }

    async changeChainColor(display: Display) {
        const color = Color(display.chainColor);

        const b = this.plugin.state.data.build();
        for (const sub of ['nucleic', 'protein'] as IDs.Substructure[]) {
            if (this.has('visual', sub)) {
                b.to(IDs.ID('visual', sub, BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            ...this.substructureVisuals(display.representation, color),
                        })
                    );
            }
        }

        if (this.has('visual', 'selected-slice', BaseRef)) {
            b.to(IDs.ID('visual', 'selected-slice', BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals('ball-and-stick', color),
                    })
                );
        }
        if (this.has('visual', 'remainder-slice', BaseRef)) {
            b.to(IDs.ID('visual', 'remainder-slice', BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals(display.representation, color),
                    })
                );
        }

        await b.commit();
    }

    async changeNtCColors(display: Display) {
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

    async changePyramids(display: Display) {
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

    async changeWaterColor(display: Display) {
        const color = Color(display.waterColor);

        const b = this.plugin.state.data.build();
        if (this.has('visual', 'water', BaseRef)) {
            b.to(IDs.ID('visual', 'water', BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.waterVisuals(color),
                    })
                );

            await b.commit();
        }
    }

    async changeRepresentation(display: Display) {
        const b = this.plugin.state.data.build();
        const repr = display.representation;
        const color = Color(display.chainColor);

        for (const sub of ['nucleic', 'protein'] as IDs.Substructure[]) {
            if (this.has('visual', sub)) {
                b.to(IDs.ID('visual', sub, BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            ...this.substructureVisuals(repr, color),
                        })
                    );
            }
        }

        if (this.has('visual', 'remainder-slice', BaseRef)) {
            b.to(IDs.ID('visual', 'remainder-slice', BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals(repr, color),
                    })
                );
        }

        await b.commit();
    }

    focusOnSelectedStep() {
        // Focus camera on the selection
        const sel = this.plugin.state.data.cells.get(IDs.ID('superposition', '', NtCSupSel));
        const prev = this.plugin.state.data.cells.get(IDs.ID('superposition', '', NtCSupPrev));
        const next = this.plugin.state.data.cells.get(IDs.ID('superposition', '', NtCSupNext));

        const prevLoci = prev?.obj ? StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(prev.obj!.data, prev.obj!.data)) : EmptyLoci;
        const nextLoci = next?.obj ? StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(next.obj!.data, next.obj!.data)) : EmptyLoci;
        let focusOn = sel?.obj ? StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(sel!.obj!.data, sel!.obj!.data)) : EmptyLoci;
        if (focusOn.kind === 'empty-loci')
            return;

        if (prevLoci.kind === 'element-loci')
            focusOn = StructureElement.Loci.union(focusOn, prevLoci);
        if (nextLoci.kind === 'element-loci')
            focusOn = StructureElement.Loci.union(focusOn, nextLoci);

        this.focusOnLoci(focusOn);
    }

    gatherStepInfo(): { steps: StepInfo[], stepNames: Map<string, number> }|undefined {
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
        const _chains = tableStep.getField('auth_asym_id_1');
        const _authSeqId1 = tableStep.getField('auth_seq_id_1');
        const _authSeqId2 = tableStep.getField('auth_seq_id_2');
        const _labelAltId1 = tableStep.getField('label_alt_id_1');
        const _labelAltId2 = tableStep.getField('label_alt_id_2');
        const _stepIds = tableSum.getField('step_id');
        const _assignedNtCs = tableSum.getField('assigned_NtC');
        const _closestNtCs = tableSum.getField('closest_NtC');
        const _models = tableStep.getField('PDB_model_number');
        if (!_ids || !_names || !_chains || !_stepIds || !_assignedNtCs || !_closestNtCs || !_labelAltId1 || !_labelAltId2 || !_authSeqId1 || !_authSeqId2 || !_models) {
            console.warn('Expected fields are not present in NtC categories');
            return void 0;
        }

        const ids = _ids.toIntArray();
        const names = _names.toStringArray();
        const chains = _chains.toStringArray();
        const authSeqId1 = _authSeqId1.toIntArray();
        const authSeqId2 = _authSeqId2.toIntArray();
        const labelAltId1 = _labelAltId1.toStringArray();
        const labelAltId2 = _labelAltId2.toStringArray();
        const stepIds = _stepIds.toIntArray();
        const assignedNtCs = _assignedNtCs.toStringArray();
        const closestNtCs = _closestNtCs.toStringArray();
        const models = _models.toIntArray();
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
                    const chain = chains[jdx];
                    const resNo1 = authSeqId1[jdx];
                    const resNo2 = authSeqId2[jdx];
                    const altId1 = labelAltId1[jdx] === '' ? void 0 : labelAltId1[jdx];
                    const altId2 = labelAltId2[jdx] === '' ? void 0 : labelAltId2[jdx];
                    const model = models[jdx];

                    // We're assuming that steps are ID'd with a contigious, monotonic sequence starting from 1
                    steps[id - 1] = {
                        name,
                        assignedNtC,
                        closestNtC,
                        chain,
                        resNo1,
                        resNo2,
                        altId1,
                        altId2,
                        model
                    };
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
        return !!this.plugin.state.data.cells.get(IDs.ID(id, sub, ref))?.obj?.data;
    }

    isReady() {
        return this.has('structure', '', BaseRef);
    }

    async loadStructure(data: string, type: 'pdb'|'cif', display: Display) {
        // TODO: Remove the currently loaded structure

        const chainColor = Color(display.chainColor);
        const waterColor = Color(display.waterColor);

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
                    this.substructureVisuals('cartoon', chainColor),
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
                    this.substructureVisuals('cartoon', chainColor),
                    { ref: IDs.ID('visual', 'protein', BaseRef) }
                );
        }
        if (display.showWater && this.has('structure', 'water')) {
            bb.to(IDs.ID('structure', 'water', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.waterVisuals(waterColor),
                    { ref: IDs.ID('visual', 'water', BaseRef) }
                );
        }

        await bb.commit();

        this.haveMultipleModels = this.getModelCount() > 1;

        const ntcInfo = this.gatherStepInfo();
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
            b.apply(RawData, { data: cfmr, label: `Reference ${c}` }, { ref: IDs.ID('data', '', bRef) })
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

    async onDeselected() {
        this.app.viewerStepDeselected();
    }

    async onLociSelected(selected: Representation.Loci) {
        const loci = Loci.normalize(selected.loci, 'two-residues');

        if (loci.kind === 'element-loci') {
            const stepDesc = Step.describe(loci);
            if (stepDesc) {
                const stepName = Step.name(stepDesc, this.haveMultipleModels);
                this.app.viewerStepSelected(stepName);
            }
        }
    }

    async actionDeselectStep(display: Display) {
        await this.plugin.state.data.build()
            .delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext))
            .delete(IDs.ID('structure', 'selected-slice', BaseRef))
            .delete(IDs.ID('structure', 'remainder-slice', BaseRef))
            .commit();

        await this.toggleSubstructure('nucleic', display);

        this.resetCameraRadius();
    }

    async actionSelectStep(stepName: string, stepNamePrev: string|undefined, stepNameNext: string|undefined, referenceNtc: string, references: ('sel'|'prev'|'next')[], display: Display): Promise<{ rmsd: number }|undefined> {
        const stepCurrent = this.stepFromName(stepName);
        if (!stepCurrent)
            return void 0;

        // Switch to a different model if the selected step is from a different model
        // This is the first thing we need to do
        if (stepCurrent.model !== this.currentModelNumber())
            await this.switchModel({ modelNumber: stepCurrent.model });

        const entireStruCell = this.plugin.state.data.cells.get(IDs.ID('structure', 'nucleic', BaseRef));
        if (!entireStruCell)
            return void 0;
        const stru = entireStruCell.obj!.data!;
        const struLoci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(stru, stru));

        const lociCurrent = Traverse.findStep(
            stepCurrent.chain,
            stepCurrent.resNo1,
            stepCurrent.altId1,
            struLoci,
            'auth'
        );
        if (lociCurrent.kind !== 'element-loci')
            return void 0;

        const current = {
            step: stepCurrent,
            loci: lociCurrent,
        };

        const prev = stepNamePrev ? this.toStepWithStructure(stepNamePrev, struLoci) : undefined;
        const next = stepNameNext ? this.toStepWithStructure(stepNameNext, struLoci) : undefined;

        const toUnionize = [StructureElement.Loci.toStructure(current.loci)];
        if (prev)
            toUnionize.push(StructureElement.Loci.toStructure(prev.loci));
        if (next)
            toUnionize.push(StructureElement.Loci.toStructure(next.loci));

        const slice = structureUnion(stru, toUnionize);
        const stepBundle = StructureElement.Bundle.fromSubStructure(stru, slice);

        const subtracted = structureSubtract(stru, slice);
        const remainderBundle = StructureElement.Bundle.fromSubStructure(stru, subtracted);

        const chainColor = Color(display.chainColor);
        const b = this.plugin.state.data.build();
        b.to(entireStruCell)
            .apply(
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: stepBundle, label: 'Step' },
                { ref: IDs.ID('structure', 'selected-slice', BaseRef) }
            )
            .apply(
                StateTransforms.Representation.StructureRepresentation3D,
                this.substructureVisuals('ball-and-stick', chainColor),
                { ref: IDs.ID('visual', 'selected-slice', BaseRef) }
            )
            .to(entireStruCell)
            .apply(
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: remainderBundle, label: 'Remainder' },
                { ref: IDs.ID('structure', 'remainder-slice', BaseRef) }
            );

        // Only show the remainder if the nucleic substructure is shown
        if (display.showNucleic) {
            b.to(IDs.ID('structure', 'remainder-slice', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(display.representation, chainColor),
                    { ref: IDs.ID('visual', 'remainder-slice', BaseRef) }
                )
                .delete(IDs.ID('visual', 'nucleic', BaseRef));
        }

        const rmsd = this.superposeReferences(b.toRoot(), current, prev, next, referenceNtc, references);
        if (!rmsd)
            return void 0;

        await b.commit();

        return { rmsd };
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

    superposeReferences<A extends StateObject, T extends StateTransformer>(b: StateBuilder.To<A, T>, current: StepWithStructure, prev: StepWithStructure|undefined, next: StepWithStructure|undefined, referenceNtc: string, references: ('sel'|'prev'|'next')[]) {
        const ReferenceVisuals = (color: number) => {
            return {
                type: { name: 'ball-and-stick', params: { sizeFactor: 0.15, aromaticBonds: false } },
                colorTheme: { name: 'uniform', params: { value: Color(color) } },
            };
        };

        const ntcRefSel = this.ntcRef(current.step, 'sel')!;
        const ntcRefPrev = prev ? this.ntcRef(prev.step, 'prev') : undefined;
        const ntcRefNext = next ? this.ntcRef(next?.step, 'next') : undefined;

        b.delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext));

        const addReference = (ntcRef: string, superposRef: string, loci: StructureElement.Loci, altId1: string|undefined, altId2: string|undefined, color: number) => {
            const refStru = this.plugin.state.data.cells.get(IDs.ID('structure', '', ntcRef))!.obj!;
            const refLoci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(refStru.data, refStru.data));

            if (Step.is(loci)) {
                const { bTransform, rmsd } = this.superpose(refLoci, loci, altId1, altId2);
                if (isNaN(bTransform[0])) {
                    console.error(`Cannot superpose reference conformer ${ntcRef} onto selection`);
                    return void 0;
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

        const rmsd = addReference(ntcRefSel, NtCSupSel, current.loci, current.step.altId1, current.step.altId2, 0x008000);
        if (ntcRefPrev) {
            const { altId1, altId2 } = prev!.step;
            addReference(ntcRefPrev, NtCSupPrev, prev!.loci, altId1, altId2, 0x0000FF);
        }
        if (ntcRefNext) {
            const { altId1, altId2 } = next!.step;
            addReference(ntcRefNext, NtCSupNext, next!.loci, altId1, altId2, 0x00FFFF);
        }

        return rmsd;
    }

    async toggleSubstructure(sub: IDs.Substructure, display: Display) {
        const show = sub === 'nucleic' ? !!display.showNucleic :
            sub === 'protein' ? !!display.showProtein : !!display.showWater;
        const repr = display.representation;

        if (sub === 'nucleic')
            this.toggleNucleicSubstructure(show, repr, Color(display.chainColor));
        else {
            if (show) {
                const b = this.getBuilder('structure', sub);
                const visuals = sub === 'water' ? this.waterVisuals(Color(display.waterColor)) : this.substructureVisuals(repr, Color(display.chainColor));
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
}
