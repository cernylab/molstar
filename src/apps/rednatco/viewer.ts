import * as IDs from './idents';
import * as RefCfmr from './reference-conformers';
import { ReDNATCOMspApi as Api } from './api';
import { ReDNATCOMsp, Display, VisualRepresentations } from './index';
import { NtCColors } from './colors';
import { Filters } from './filters';
import { Filtering } from './filtering';
import { ReferenceConformersPdbs } from './reference-conformers-pdbs';
import { Step } from './step';
import { Superpose } from './superpose';
import { Traverse } from './traverse';
import { isoBounds, prettyIso } from './util';
import { DnatcoNtCs } from '../../extensions/dnatco';
import { DnatcoTypes } from '../../extensions/dnatco/types';
import { NtCTubeTypes } from '../../extensions/dnatco/ntc-tube/types';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { BoundaryHelper } from '../../mol-math/geometry/boundary-helper';
import { Vec3 } from '../../mol-math/linear-algebra/3d';
import { EmptyLoci, Loci } from '../../mol-model/loci';
import { ElementIndex, Model, Structure, StructureElement, StructureProperties, StructureSelection, Trajectory } from '../../mol-model/structure';
import { Volume } from '../../mol-model/volume';
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
import { Script } from '../../mol-script/script';
import { MolScriptBuilder as MSB } from '../../mol-script/language/builder';
import { formatMolScript } from '../../mol-script/language/expression-formatter';
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
    'ntcs-prop': PluginSpec.Behavior(DnatcoNtCs),
};

const AnimationDurationMsec = 150;
const BaseRef = 'rdo';
const RCRef = 'rc';
const NtCSupPrev = 'ntc-sup-prev';
const NtCSupSel = 'ntc-sup-sel';
const NtCSupNext = 'ntc-sup-next';
const SphereBoundaryHelper = new BoundaryHelper('98');

function ntcStepToElementLoci(step: DnatcoTypes.Step, stru: Structure) {
    let expr = MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_asym_id(), step.auth_asym_id_1]);
    expr = MSB.core.logic.and([
        MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_seq_id(), step.auth_seq_id_1]),
        expr
    ]);
    expr = MSB.core.logic.and([
        MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.label_alt_id(), step.label_alt_id_1]),
        expr
    ]);
    expr = MSB.struct.generator.atomGroups({ 'atom-test': expr, 'group-by': MSB.struct.atomProperty.macromolecular.label_asym_id() });

    return Loci.normalize(
        Script.toLoci(
            Script(formatMolScript(expr), 'mol-script'),
            stru
        ),
        'two-residues'
    );
}

function rcref(c: string, where: 'sel' | 'prev' | 'next' | '' = '') {
    return `${RCRef}-${c}-${where}`;
}

function superpositionAtomsIndices(loci: StructureElement.Loci) {
    const es = loci.elements[0];
    const loc = Location.create(loci.structure, es.unit, es.unit.elements[OrderedSet.getAt(es.indices, 0)]);
    const len = OrderedSet.size(es.indices);
    const indices = new Array<ElementIndex>();

    const gather = (atoms: string[], start: number, end: number) => {
        for (const atom of atoms) {
            let idx = start;
            for (; idx < end; idx++) {
                loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
                const _atom = StructureProperties.atom.label_atom_id(loc);
                if (atom === _atom) {
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
    const resNo1 = StructureProperties.residue.label_seq_id(loc);
    let secondIdx = -1;
    for (let idx = 0; idx < len; idx++) {
        loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
        const resNo = StructureProperties.residue.label_seq_id(loc);
        if (resNo !== resNo1) {
            secondIdx = idx;
            break;
        }
    }
    if (secondIdx === -1) {
        console.log('No first/second residue split');
        return [];
    }

    // Gather element indices for the first residue
    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, 0)];
    const compId1 = StructureProperties.atom.label_comp_id(loc);
    const atoms1 = RefCfmr.referenceAtoms(compId1.toUpperCase(), 'first');
    if (!gather(atoms1, 0, secondIdx)) {
        console.log('No ref atoms for first');
        return [];
    }

    // Gather element indices for the second residue
    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, secondIdx)];
    const compId2 = StructureProperties.atom.label_comp_id(loc);
    const atoms2 = RefCfmr.referenceAtoms(compId2.toUpperCase(), 'second');
    if (!gather(atoms2, secondIdx, len)) {
        console.log('No ref atoms for second');
        return [];
    }

    return indices;
}

function visualForSubstructure(sub: IDs.Substructure, display: Display) {
    if (sub === 'nucleic') {
        return display.structures.nucleicRepresentation === 'ntc-tube'
            ? SubstructureVisual.NtC('ntc-tube', display.structures.conformerColors)
            : SubstructureVisual.BuiltIn(display.structures.nucleicRepresentation, Color(display.structures.chainColor));
    } else if (sub === 'protein') {
        return SubstructureVisual.BuiltIn(display.structures.proteinRepresentation, Color(display.structures.chainColor));
    } else /* water */ {
        return SubstructureVisual.BuiltIn('ball-and-stick', Color(display.structures.waterColor));
    }
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
                        } else if (current.loci.kind === 'data-loci') {
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

export namespace SubstructureVisual {
    export type BuiltIn = {
        type: 'built-in',
        repr: Omit<VisualRepresentations, 'ntc-tube'>,
        color: Color
    }
    export function BuiltIn(repr: BuiltIn['repr'], color: BuiltIn['color']): BuiltIn {
        return { type: 'built-in', repr, color };
    }

    export type NtC = {
        type: 'ntc',
        repr: 'ntc-tube',
        colors: NtCColors.Conformers
    }
    export function NtC(repr: NtC['repr'], colors: NtC['colors']): NtC {
        return { type: 'ntc', repr, colors };
    }

    export type Types = BuiltIn | NtC;
}

export class ReDNATCOMspViewer {
    private haveMultipleModels = false;
    private steps: Step.ExtendedDescription[] = [];
    private stepNames: Map<string, number> = new Map();
    private app: ReDNATCOMsp;

    constructor(public plugin: PluginUIContext, interactionContext: { self?: ReDNATCOMspViewer }, app: ReDNATCOMsp) {
        interactionContext.self = this;
        this.app = app;
    }

    private densityMapVisuals(vis: Display['densityMaps'][0], visKind: 'absolute' | 'positive' | 'negative') {
        const isoValue = visKind === 'absolute'
            ? Volume.IsoValue.absolute(vis.isoValue)
            : visKind === 'positive'
                ? Volume.IsoValue.relative(vis.isoValue) : Volume.IsoValue.relative(-vis.isoValue);

        const color = visKind === 'absolute' || visKind === 'positive'
            ? vis.colors[0] : vis.colors[1];

        return {
            type: {
                name: 'isosurface',
                params: {
                    alpha: vis.alpha,
                    isoValue,
                    visuals: vis.representations,
                    sizeFactor: 0.75,
                }
            },
            colorTheme: {
                name: 'uniform',
                params: { value: Color(color.color) },
            },
        };
    }

    private focusOnLoci(loci: StructureElement.Loci) {
        if (!this.plugin.canvas3d)
            return;

        const sphere = Loci.getBoundingSphere(loci);
        if (!sphere)
            return;
        const snapshot = this.plugin.canvas3d.camera.getSnapshot();
        const radius = sphere.radius < 1 ? 1 : sphere.radius;

        const v = Vec3();
        const u = Vec3();
        Vec3.set(v, sphere.center[0], sphere.center[1], sphere.center[2]);
        Vec3.set(u, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        Vec3.sub(u, u, v);
        Vec3.normalize(u, u);
        Vec3.scale(u, u, radius * 8);
        Vec3.add(v, u, v);

        snapshot.target = sphere.center;
        snapshot.position = v;
        snapshot.radius = radius;

        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
    }

    private getBuilder(id: IDs.ID, sub: IDs.Substructure | '' = '', ref = BaseRef) {
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

    private ntcRef(ntc: string, where: 'sel' | 'prev' | 'next') {
        return rcref(ntc, where);
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

    private substructureVisuals(visual: SubstructureVisual.Types) {
        if (visual.type === 'built-in') {
            switch (visual.repr) {
                case 'cartoon':
                    return {
                        type: {
                            name: 'cartoon',
                            params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
                        },
                        colorTheme: { name: 'uniform', params: { value: visual.color } }
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
                        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'custom', params: visual.color } } },
                    };
            }
        } else if (visual.type === 'ntc') {
            switch (visual.repr) {
                case 'ntc-tube':
                    return {
                        type: {
                            name: 'ntc-tube',
                            params: {},
                        },
                        colorTheme: {
                            name: 'ntc-tube',
                            params: {
                                colors: {
                                    name: 'custom',
                                    params: visual.colors,
                                },
                            },
                        },
                    };
            }
        }
    }

    private superpose(reference: StructureElement.Loci, stru: StructureElement.Loci) {
        const refElems = superpositionAtomsIndices(reference);
        const struElems = superpositionAtomsIndices(stru);

        return Superpose.superposition(
            { elements: refElems, conformation: reference.elements[0].unit.conformation },
            { elements: struElems, conformation: stru.elements[0].unit.conformation }
        );
    }

    private async toggleNucleicSubstructure(show: boolean, visual: SubstructureVisual.Types) {
        if (this.has('structure', 'remainder-slice', BaseRef)) {
            const b = this.getBuilder('structure', 'remainder-slice');
            if (show) {
                b.apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(visual),
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
                    this.substructureVisuals(visual),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
            } else
                b.delete(IDs.ID('visual', 'nucleic', BaseRef));

            await b.commit();
        }
    }

    private toStepLoci(name: string, struLoci: StructureElement.Loci) {
        const step = this.stepFromName(name);
        if (!step)
            return EmptyLoci;

        return Traverse.findStep(
            step.chain,
            step.resNo1, step.altId1, step.insCode1,
            step.resNo2, step.altId2, step.insCode2,
            struLoci,
            'auth'
        );
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
                        onDeselected: () => interactCtx.self!.notifyStepDeselected(),
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

    async changeChainColor(subs: IDs.Substructure[], display: Display) {
        const b = this.plugin.state.data.build();

        const color = Color(display.structures.chainColor);

        for (const sub of subs) {
            const vis = visualForSubstructure(sub, display);

            if (this.has('visual', sub)) {
                b.to(IDs.ID('visual', sub, BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            ...this.substructureVisuals(vis),
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
                        ...this.substructureVisuals(SubstructureVisual.BuiltIn('ball-and-stick', color)),
                    })
                );
        }

        if (this.has('visual', 'remainder-slice', BaseRef)) {
            const vis = visualForSubstructure('nucleic', display);

            b.to(IDs.ID('visual', 'remainder-slice', BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals(vis),
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
                            params: display.structures.conformerColors ?? NtCColors.Conformers,
                        },
                    },
                },
            })
        );

        await b.commit();
    }

    async changePyramids(display: Display) {
        if (display.structures.showPyramids) {
            if (!this.has('pyramids', 'nucleic')) {
                const b = this.getBuilder('structure', 'nucleic');
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.pyramidsParams(display.structures.conformerColors ?? NtCColors.Conformers, new Map(), display.structures.pyramidsTransparent ?? false),
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
                        ...this.pyramidsParams(display.structures.conformerColors ?? NtCColors.Conformers, new Map(), display.structures.pyramidsTransparent ?? false),
                    })
                );
                await b.commit();
            }
        } else
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('pyramids', 'nucleic', BaseRef) });
    }

    async changeWaterColor(display: Display) {
        const color = Color(display.structures.waterColor);

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

    async changeRepresentation(sub: IDs.Substructure, display: Display) {
        const b = this.plugin.state.data.build();
        const vis = visualForSubstructure(sub, display);

        if (this.has('visual', sub)) {
            b.to(IDs.ID('visual', sub, BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals(vis),
                    })
                );
        }

        if (sub === 'nucleic') {
            if (this.has('visual', 'remainder-slice', BaseRef)) {
                b.to(IDs.ID('visual', 'remainder-slice', BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            ...this.substructureVisuals(vis),
                        })
                    );
            }
        }

        await b.commit();
    }

    async changeDensityMap(index: number, display: Display) {
        if (!this.hasDensityMaps())
            return;

        const dm = display.densityMaps[index];

        if (dm.kind === 'fo-fc') {
            await this.plugin.state.data.build().to(IDs.DensityID(index, 'visual', BaseRef + '_pos'))
                .update(
                    StateTransforms.Representation.VolumeRepresentation3D,
                    old => ({
                        ...old,
                        ...this.densityMapVisuals(dm, 'positive'),
                    })
                )
                .to(IDs.DensityID(index, 'visual', BaseRef + '_neg'))
                .update(
                    StateTransforms.Representation.VolumeRepresentation3D,
                    old => ({
                        ...old,
                        ...this.densityMapVisuals(dm, 'negative'),
                    })
                )
                .commit();
        } else {
            await this.plugin.state.data.build().to(IDs.DensityID(index, 'visual', BaseRef))
                .update(
                    StateTransforms.Representation.VolumeRepresentation3D,
                    old => ({
                        ...old,
                        ...this.densityMapVisuals(dm, 'absolute'),
                    })
                )
                .commit();
        }
    }

    currentModelNumber() {
        const model = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!model)
            return -1;
        return (model as StateObject<Model>).data.modelNum;
    }

    densityMapIsoRange(index: number, ref = BaseRef): { min: number, max: number } | undefined {
        const cell = this.plugin.state.data.cells.get(IDs.DensityID(index, 'volume', ref));
        if (!cell || !cell.obj)
            return void 0;

        const grid = (cell.obj.data as Volume).grid;
        return { min: grid.stats.min, max: grid.stats.max };
    }

    focusOnSelectedStep() {
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

    gatherStepInfo(): { steps: Step.ExtendedDescription[], stepNames: Map<string, number> } | undefined {
        const obj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!obj)
            return void 0;
        const struModel = (obj as StateObject<Model>);
        const sourceData = struModel.data.sourceData;
        if (!MmcifFormat.is(sourceData))
            return void 0;

        const tableSum = sourceData.data.frame.categories['ndb_struct_ntc_step_summary'];
        const tableStep = sourceData.data.frame.categories['ndb_struct_ntc_step'];
        if (!tableSum || !tableStep) {
            console.warn('NtC information not present');
            return void 0;
        }

        const _ids = tableStep.getField('id')?.toIntArray();
        const _names = tableStep.getField('name')?.toStringArray();
        const _chains = tableStep.getField('auth_asym_id_1')?.toStringArray();
        const _authSeqId1 = tableStep.getField('auth_seq_id_1')?.toIntArray();
        const _authSeqId2 = tableStep.getField('auth_seq_id_2')?.toIntArray();
        const _compId1 = tableStep.getField('label_comp_id_1')?.toStringArray();
        const _compId2 = tableStep.getField('label_comp_id_2')?.toStringArray();
        const _labelAltId1 = tableStep.getField('label_alt_id_1')?.toStringArray();
        const _labelAltId2 = tableStep.getField('label_alt_id_2')?.toStringArray();
        const _PDBinsCode1 = tableStep.getField('PDB_ins_code_1')?.toStringArray();
        const _PDBinsCode2 = tableStep.getField('PDB_ins_code_2')?.toStringArray();
        const _stepIds = tableSum.getField('step_id')?.toIntArray();
        const _assignedNtCs = tableSum.getField('assigned_NtC')?.toStringArray();
        const _closestNtCs = tableSum.getField('closest_NtC')?.toStringArray();
        const _models = tableStep.getField('PDB_model_number')?.toIntArray();
        if (!_ids || !_names || !_chains || !_stepIds || !_assignedNtCs || !_closestNtCs || !_labelAltId1 || !_labelAltId2 || !_authSeqId1 || !_authSeqId2 || !_compId1 || !_compId2 || !_PDBinsCode1 || !_PDBinsCode2 || !_models) {
            console.warn('Expected fields are not present in NtC categories');
            return void 0;
        }

        const len = _ids.length;
        const stepNames = new Map<string, number>();
        const steps = new Array<Step.ExtendedDescription>(len);

        for (let idx = 0; idx < len; idx++) {
            const id = _ids[idx];
            const name = _names[idx];
            for (let jdx = 0; jdx < len; jdx++) {
                if (_stepIds[jdx] === id) {
                    const assignedNtC = _assignedNtCs[jdx];
                    const closestNtC = _closestNtCs[jdx];
                    const chain = _chains[jdx];
                    const resNo1 = _authSeqId1[jdx];
                    const resNo2 = _authSeqId2[jdx];
                    const compId1 = _compId1[jdx];
                    const compId2 = _compId2[jdx];
                    const altId1 = _labelAltId1[jdx] === '' ? void 0 : _labelAltId1[jdx];
                    const altId2 = _labelAltId2[jdx] === '' ? void 0 : _labelAltId2[jdx];
                    const insCode1 = _PDBinsCode1[jdx];
                    const insCode2 = _PDBinsCode2[jdx];
                    const model = _models[jdx];

                    // We're assuming that steps are ID'd with a contigious, monotonic sequence starting from 1
                    steps[id - 1] = {
                        name,
                        model,
                        entryId: struModel.data.entryId,
                        assignedNtC,
                        closestNtC,
                        chain,
                        resNo1,
                        resNo2,
                        compId1,
                        compId2,
                        altId1,
                        altId2,
                        insCode1,
                        insCode2,
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

    has(id: IDs.ID, sub: IDs.Substructure | '' = '', ref = BaseRef) {
        return !!this.plugin.state.data.cells.get(IDs.ID(id, sub, ref))?.obj?.data;
    }

    hasDensityMaps(ref = BaseRef) {
        return !!this.plugin.state.data.cells.get(IDs.DensityID(0, 'volume', ref))?.obj?.data;
    }

    isReady() {
        return this.has('entire-structure', '', BaseRef);
    }

    async loadStructure(
        coords: { data: string, type: Api.CoordinatesFormat },
        densityMaps: { data: Uint8Array, type: Api.DensityMapFormat, kind: Api.DensityMapKind }[] | null,
        display: Display
    ) {
        // TODO: Remove the currently loaded structure

        const chainColor = Color(display.structures.chainColor);
        const waterColor = Color(display.structures.waterColor);

        const b = (t => coords.type === 'pdb'
            ? t.apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
            : t.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
        )(this.plugin.state.data.build().toRoot().apply(RawData, { data: coords.data }, { ref: IDs.ID('data', '', BaseRef) }))
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: display.structures.modelNumber ? display.structures.modelNumber - 1 : 0 }, { ref: IDs.ID('model', '', BaseRef) })
            .apply(StateTransforms.Model.StructureFromModel, {}, { ref: IDs.ID('entire-structure', '', BaseRef) })
            // Extract substructures
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'nucleic' }, { ref: IDs.ID('entire-structure', 'nucleic', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'protein' }, { ref: IDs.ID('entire-structure', 'protein', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { ref: IDs.ID('entire-structure', 'water', BaseRef) });
        // Commit now so that we can check whether individual substructures are available and apply filters
        await b.commit();

        // Create the "possibly filtered" structure PSOs
        const b2 = this.plugin.state.data.build();
        if (this.has('entire-structure', 'nucleic')) {
            b2.to(IDs.ID('entire-structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: Filtering.toExpression(Filters.Empty()) },
                    { ref: IDs.ID('structure', 'nucleic', BaseRef) }
                );
        }
        if (this.has('entire-structure', 'protein')) {
            b2.to(IDs.ID('entire-structure', 'protein', BaseRef))
                .apply(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: Filtering.toExpression(Filters.Empty()) },
                    { ref: IDs.ID('structure', 'protein', BaseRef) }
                );
        }
        if (this.has('entire-structure', 'water')) {
            b2.to(IDs.ID('entire-structure', 'water', BaseRef))
                .apply(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: Filtering.toExpression(Filters.Empty()) },
                    { ref: IDs.ID('structure', 'water', BaseRef) }
                );
        }
        await b2.commit();

        // Create default visuals
        const b3 = this.plugin.state.data.build();
        if (display.structures.showNucleic && this.has('structure', 'nucleic')) {
            b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(SubstructureVisual.BuiltIn('cartoon', chainColor)),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
            if (display.structures.showPyramids) {
                b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                    .apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.pyramidsParams(display.structures.conformerColors ?? NtCColors.Conformers, new Map(), false),
                        { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                    );
            }
        }
        if (display.structures.showProtein && this.has('structure', 'protein')) {
            b3.to(IDs.ID('structure', 'protein', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(SubstructureVisual.BuiltIn('cartoon', chainColor)),
                    { ref: IDs.ID('visual', 'protein', BaseRef) }
                );
        }
        if (display.structures.showWater && this.has('structure', 'water')) {
            b3.to(IDs.ID('structure', 'water', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.waterVisuals(waterColor),
                    { ref: IDs.ID('visual', 'water', BaseRef) }
                );
        }

        await b3.commit();

        // Load density map, if any
        if (densityMaps) {
            for (let idx = 0; idx < densityMaps.length; idx++) {
                const dm = densityMaps[idx];
                if (dm.type === 'ccp4') {
                    await this.plugin.state.data.build().toRoot()
                        .apply(RawData, { data: dm.data }, { ref: IDs.DensityID(idx, 'data', BaseRef) })
                        .apply(StateTransforms.Data.ParseCcp4)
                        .apply(StateTransforms.Volume.VolumeFromCcp4, {}, { ref: IDs.DensityID(idx, 'volume', BaseRef) })
                        .commit();
                } else if (dm.type === 'dsn6') {
                    await this.plugin.state.data.build().toRoot()
                        .apply(RawData, { data: dm.data }, { ref: IDs.DensityID(idx, 'data', BaseRef) })
                        .apply(StateTransforms.Data.ParseDsn6)
                        .apply(StateTransforms.Volume.VolumeFromDsn6, {}, { ref: IDs.DensityID(idx, 'volume', BaseRef) })
                        .commit();
                }

                const isoRange = this.densityMapIsoRange(idx)!;
                const bounds = isoBounds(isoRange.min, isoRange.max);

                if (dm.kind === 'fo-fc') {
                    display.densityMaps[idx].isoValue = prettyIso(isoRange.max * 0.67, bounds.step);

                    this.plugin.state.data.build().to(IDs.DensityID(idx, 'volume', BaseRef))
                        .apply(
                            StateTransforms.Representation.VolumeRepresentation3D,
                            this.densityMapVisuals(display.densityMaps[idx], 'positive'),
                            { ref: IDs.DensityID(idx, 'visual', BaseRef + '_pos') }
                        )
                        .to(IDs.DensityID(idx, 'volume', BaseRef))
                        .apply(
                            StateTransforms.Representation.VolumeRepresentation3D,
                            this.densityMapVisuals(display.densityMaps[idx], 'negative'),
                            { ref: IDs.DensityID(idx, 'visual', BaseRef + '_neg') }
                        )
                        .commit();
                } else {
                    display.densityMaps[idx].isoValue = prettyIso(((isoRange.max - isoRange.min) / 2) + isoRange.min, bounds.step);

                    await this.plugin.state.data.build().to(IDs.DensityID(idx, 'volume', BaseRef))
                        .apply(
                            StateTransforms.Representation.VolumeRepresentation3D,
                            this.densityMapVisuals(display.densityMaps[idx], 'absolute'),
                            { ref: IDs.DensityID(idx, 'visual', BaseRef) }
                        )
                        .commit();
                }
            }
        }

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

    notifyStepDeselected() {
        this.app.viewerStepDeselected();
    }

    notifyStepSelected(name: string) {
        this.app.viewerStepSelected(name);
    }

    async onLociSelected(selected: Representation.Loci) {
        const normalized = (() => {
            if (selected.loci.kind === 'data-loci') {
                if (selected.loci.tag === 'dnatco-tube-segment-data') {
                    const stru = this.plugin.state.data.cells.get(IDs.ID('entire-structure', 'nucleic', BaseRef));
                    if (stru) {
                        const tubeLoci = selected.loci as NtCTubeTypes.Loci;
                        const stepIdx = tubeLoci.elements[0] / 4; // There are 4 tube segments per step
                        const step = tubeLoci.data[stepIdx];
                        if (step)
                            return ntcStepToElementLoci(step, stru.obj!.data);
                        else
                            return EmptyLoci;
                    }
                    return EmptyLoci;
                } else
                    return EmptyLoci;
            } else if (selected.loci.kind === 'element-loci')
                return Loci.normalize(selected.loci, 'two-residues');
            else
                return EmptyLoci;
        })();

        if (normalized.kind === 'element-loci') {
            const stepDesc = Step.describe(normalized, this.haveMultipleModels);
            if (stepDesc && this.stepNames.has(stepDesc.name))
                this.notifyStepSelected(stepDesc.name);
        }
    }

    async actionApplyFilter(filter: Filters.All) {
        const b = this.plugin.state.data.build();
        if (this.has('structure', 'nucleic', BaseRef)) {
            b.to(IDs.ID('structure', 'nucleic', BaseRef))
                .update(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    old => ({
                        ...old,
                        expression: Filtering.toExpression(filter)
                    })
                );
        }

        if (this.has('structure', 'protein', BaseRef)) {
            b.to(IDs.ID('structure', 'protein', BaseRef))
                .update(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    old => ({
                        ...old,
                        expression: Filtering.toExpression(filter)
                    })
                );
        }

        if (this.has('structure', 'water', BaseRef)) {
            b.to(IDs.ID('structure', 'water', BaseRef))
                .update(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    old => ({
                        ...old,
                        expression: Filtering.toExpression(filter)
                    })
                );
        }
        await b.commit();

        return true;
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
    }

    async actionSelectStep(stepSel: Api.Payloads.StepSelection, prevSel: Api.Payloads.StepSelection | undefined, nextSel: Api.Payloads.StepSelection | undefined, display: Display) {
        const step = this.stepFromName(stepSel.name);
        if (!step)
            return false;

        // Switch to a different model if the selected step is from a different model
        // This is the first thing we need to do
        if (step.model !== this.currentModelNumber())
            await this.switchModel(step.model);

        const entireStruCell = this.plugin.state.data.cells.get(IDs.ID('structure', 'nucleic', BaseRef));
        if (!entireStruCell)
            return false;
        const stru = entireStruCell.obj!.data!;
        const struLoci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(stru, stru));

        const stepLoci = Traverse.findStep(
            step.chain,
            step.resNo1, step.altId1, step.insCode1,
            step.resNo2, step.altId2, step.insCode2,
            struLoci, 'auth'
        );
        if (stepLoci.kind !== 'element-loci')
            return false;

        const prevLoci = prevSel ? this.toStepLoci(prevSel.name, struLoci) : EmptyLoci;
        const nextLoci = nextSel ? this.toStepLoci(nextSel.name, struLoci) : EmptyLoci;

        const toUnionize = [stepLoci.structure];
        if (prevLoci.kind !== 'empty-loci')
            toUnionize.push(prevLoci.structure);
        if (nextLoci.kind !== 'empty-loci')
            toUnionize.push(nextLoci.structure);

        const slice = structureUnion(stru, toUnionize);
        const stepBundle = StructureElement.Bundle.fromSubStructure(stru, slice);

        const subtracted = structureSubtract(stru, slice);
        const remainderBundle = StructureElement.Bundle.fromSubStructure(stru, subtracted);

        const chainColor = Color(display.structures.chainColor);
        const b = this.plugin.state.data.build();
        b.to(entireStruCell)
            .apply(
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: stepBundle, label: 'Step' },
                { ref: IDs.ID('structure', 'selected-slice', BaseRef) }
            )
            .apply(
                StateTransforms.Representation.StructureRepresentation3D,
                this.substructureVisuals(SubstructureVisual.BuiltIn('ball-and-stick', chainColor)),
                { ref: IDs.ID('visual', 'selected-slice', BaseRef) }
            )
            .to(entireStruCell)
            .apply(
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: remainderBundle, label: 'Remainder' },
                { ref: IDs.ID('structure', 'remainder-slice', BaseRef) }
            );

        // Only show the remainder if the nucleic substructure is shown
        if (display.structures.showNucleic) {
            const vis = display.structures.nucleicRepresentation === 'ntc-tube'
                ? SubstructureVisual.NtC('ntc-tube', display.structures.conformerColors)
                : SubstructureVisual.BuiltIn(display.structures.nucleicRepresentation, Color(display.structures.chainColor));

            b.to(IDs.ID('structure', 'remainder-slice', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(vis),
                    { ref: IDs.ID('visual', 'remainder-slice', BaseRef) }
                )
                .delete(IDs.ID('visual', 'nucleic', BaseRef));
        }

        this.superposeReferences(
            b.toRoot(),
            stepSel.reference ? { loci: stepLoci, reference: stepSel.reference } : void 0,
            prevSel?.reference && prevLoci.kind === 'element-loci' ? { loci: prevLoci, reference: prevSel.reference } : void 0,
            nextSel?.reference && nextLoci.kind === 'element-loci' ? { loci: nextLoci, reference: nextSel.reference } : void 0
        );

        await b.commit();
        return true;
    }

    redraw() {
        setTimeout(
            () => window.dispatchEvent(new Event('resize')),
            0
        );
    }

    async switchModel(modelNumber?: number) {
        if (modelNumber && modelNumber === this.currentModelNumber())
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
                    modelIndex: modelNumber ? modelNumber - 1 : 0
                })
            );

        await b.commit();
    }

    superposeReferences<A extends StateObject, T extends StateTransformer>(
        b: StateBuilder.To<A, T>,
        step?: { loci: StructureElement.Loci, reference: Api.Payloads.StepSelection['reference'] },
        prev?: { loci: StructureElement.Loci, reference: Api.Payloads.StepSelection['reference'] },
        next?: { loci: StructureElement.Loci, reference: Api.Payloads.StepSelection['reference'] }
    ) {
        const ReferenceVisuals = (color: number) => {
            return {
                type: { name: 'ball-and-stick', params: { sizeFactor: 0.15, aromaticBonds: false } },
                colorTheme: { name: 'uniform', params: { value: Color(color) } },
            };
        };

        b.delete(IDs.ID('superposition', '', NtCSupSel))
            .delete(IDs.ID('superposition', '', NtCSupPrev))
            .delete(IDs.ID('superposition', '', NtCSupNext));

        const addReference = (ntcRef: string, superposRef: string, stepLoci: StructureElement.Loci, color: number) => {
            const refStru = this.plugin.state.data.cells.get(IDs.ID('structure', '', ntcRef))!.obj!;
            const refLoci = StructureSelection.toLociWithSourceUnits(StructureSelection.Singletons(refStru.data, refStru.data));

            const { bTransform } = this.superpose(refLoci, stepLoci);
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
        };

        if (step?.reference) {
            const ref = this.ntcRef(step.reference.NtC, 'sel');
            addReference(ref, NtCSupSel, step.loci, step.reference.color);
        }
        if (prev?.reference) {
            const ref = this.ntcRef(prev.reference.NtC, 'prev');
            addReference(ref, NtCSupPrev, prev.loci, prev.reference.color);
        }
        if (next?.reference) {
            const ref = this.ntcRef(next?.reference.NtC, 'next');
            addReference(ref, NtCSupNext, next.loci, next.reference.color);
        }
    }

    async toggleSubstructure(sub: IDs.Substructure, display: Display) {
        if (sub === 'nucleic') {
            const show = display.structures.showNucleic;
            const vis = display.structures.nucleicRepresentation === 'ntc-tube'
                ? SubstructureVisual.NtC('ntc-tube', display.structures.conformerColors)
                : SubstructureVisual.BuiltIn(display.structures.nucleicRepresentation, Color(display.structures.chainColor));

            await this.toggleNucleicSubstructure(show, vis);
        } else if (sub === 'protein') {
            if (!display.structures.showProtein) {
                await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('visual', sub, BaseRef) });
                this.resetCameraRadius();
            } else {
                const b = this.getBuilder('structure', sub);
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.substructureVisuals(SubstructureVisual.BuiltIn(display.structures.proteinRepresentation, display.structures.chainColor)),
                        { ref: IDs.ID('visual', sub, BaseRef) }
                    );
                    await b.commit();
                }
            }
        } else if (sub === 'water') {
            if (!display.structures.showWater) {
                await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('visual', sub, BaseRef) });
                this.resetCameraRadius();
            } else {
                const b = this.getBuilder('structure', sub);
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.waterVisuals(display.structures.waterColor),
                        { ref: IDs.ID('visual', sub, BaseRef) }
                    );
                    await b.commit();
                }
            }
        }
    }
}
