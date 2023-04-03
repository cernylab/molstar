import * as IDs from './idents';
import * as RefCfmr from './reference-conformers';
import { ReDNATCOMspApi as Api } from './api';
import { ReDNATCOMsp, Display, VisualRepresentations } from './index';
import { NtCColors } from './colors';
import { Filters } from './filters';
import { Filtering } from './filtering';
import { ReferenceConformersPdbs } from './reference-conformers-pdbs';
import { Residue } from './residue';
import { Search } from './search';
import { Step } from './step';
import { Superpose } from './superpose';
import { isoBounds, prettyIso } from './util';
import { DnatcoNtCs } from '../../extensions/dnatco';
import { DnatcoTypes } from '../../extensions/dnatco/types';
import { NtCTubeTypes } from '../../extensions/dnatco/ntc-tube/types';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { BoundaryHelper } from '../../mol-math/geometry/boundary-helper';
import { Vec3 } from '../../mol-math/linear-algebra/3d';
import { EmptyLoci, Loci } from '../../mol-model/loci';
import { ElementIndex, Model, Structure, StructureElement, StructureProperties, Trajectory } from '../../mol-model/structure';
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
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { RawData } from '../../mol-plugin-state/transforms/data';
import { createPluginUI } from '../../mol-plugin-ui';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { Representation } from '../../mol-repr/representation';
import { StateObjectCell, StateObject } from '../../mol-state';
import { Script } from '../../mol-script/script';
import { MolScriptBuilder as MSB } from '../../mol-script/language/builder';
import { formatMolScript } from '../../mol-script/language/expression-formatter';
import { Task } from '../../mol-task';
import { lociLabel } from '../../mol-theme/label';
import { UUID } from '../../mol-util';
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
const SphereBoundaryHelper = new BoundaryHelper('98');

export function filterLociByAltId(altId: string, loci: StructureElement.Loci) {
    if (altId === '')
        return loci;

    const _loc = StructureElement.Location.create();
    const e = loci.elements[0];

    _loc.structure = loci.structure;
    _loc.unit = e.unit;

    const N = OrderedSet.size(loci.elements[0].indices);
    const filteredIndices = [];
    for (let idx = 0; idx < N; idx++) {
        const uI = OrderedSet.getAt(e.indices, idx);
        _loc.element = OrderedSet.getAt(_loc.unit.elements, uI);
        const _altId = StructureProperties.atom.label_alt_id(_loc);
        if (_altId === '' || altId === _altId)
            filteredIndices.push(uI);
    }

    const filteredLoci = StructureElement.Loci(
        loci.structure,
        [{ unit: e.unit, indices: OrderedSet.ofSortedArray(filteredIndices) }]
    );

    return Structure.toStructureElementLoci(StructureElement.Loci.toStructure(filteredLoci));
}

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
    name: 'rednatco-loci-label-provider',
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

type OtherStruObjectParams = {
    kind: 'model' | 'structure' | 'other',
}
type VisualStruObjectParams = {
    kind: 'visual',
    params: {
        molstar: Partial<ReturnType<StructureRepresentation3D['createDefaultParams']>>,
        useChainColor: boolean,
    },
}
type StruObject = {
    id: string,
    parentId: string,
    params: OtherStruObjectParams | VisualStruObjectParams,
    primary: boolean,
}
function StruObject(id: string, parentId: string, params: StruObject['params'], primary: boolean): StruObject {
    return { id, parentId, params, primary };
}

type StruSelection = {
    selector: Api.Payloads.StructureSelection,
    objects: StruObject[],
    update: boolean,
}
function StruSelection(selector: Api.Payloads.StructureSelection, objects: StruSelection['objects'] = [], update = false): StruSelection {
    return { selector, objects, update };
}

const AtomSelPayloadCmpKeys = ObjectKeys(Api.Payloads.AtomSelection(0, '', '', -1, '', '', '', 0)).filter((k) => k !== 'color');
function atomsEqual(a: Api.Payloads.AtomSelection, b: Api.Payloads.AtomSelection) {
    for (const key of AtomSelPayloadCmpKeys) {
        if (a[key] !== b[key])
            return false;
    }
    return true;
}

function ntcReferencesEqual(a?: Api.Payloads.StepReference, b?: Api.Payloads.StepReference) {
    if (a && !b || !a && b)
        return false;
    else if (a && b)
        return a.NtC === b.NtC && a.color === b.color;
    return true;
}

function residuesEqual(a: Api.Payloads.ResidueSelection, b: Api.Payloads.ResidueSelection) {
    return (
        a.modelNum === b.modelNum &&
        a.cifChain === b.cifChain &&
        a.seqId === b.seqId &&
        a.insCode === b.insCode
    );
}

export class ReDNATCOMspViewer {
    private haveMultipleModels = false;
    private steps: Step.ExtendedDescription[] = [];
    private stepNames: Map<string, number> = new Map();
    private app: ReDNATCOMsp;
    private selections = new Array<StruSelection>();

    constructor(public plugin: PluginUIContext, interactionContext: { self?: ReDNATCOMspViewer }, app: ReDNATCOMsp) {
        interactionContext.self = this;
        this.app = app;

        this.plugin.canvas3d?.setProps({
            renderer: {
                highlightColor: Color(0x49ff92),
            },
            marking: {
                highlightEdgeColor: Color(0x49ff92),
                highlightEdgeStrength: 2.0,
            }
        });
    }

    private addSelection(ns: StruSelection) {
        const selector = ns.selector;

        if (selector.type === 'step') {
            for (const sel of this.selections) {
                if (sel.selector.type !== 'step')
                    continue;

                if (selector.name === sel.selector.name) {
                    if (!ntcReferencesEqual(selector.reference, sel.selector.reference)) {
                        sel.selector = selector;
                        sel.update = true;
                    }
                    return false;
                }
            }
        } else if (selector.type === 'residue') {
            for (const sel of this.selections) {
                if (sel.selector.type !== 'residue')
                    continue;

                const _selector = sel.selector;
                if (residuesEqual(_selector, selector)) {
                    if (_selector.color !== selector.color) {
                        _selector.color = selector.color;
                        sel.update = true;
                    }

                    return false;
                }
            }
        } else if (selector.type === 'atom') {
            for (const sel of this.selections) {
                if (sel.selector.type !== 'atom')
                    continue;

                const _selector = sel.selector;
                if (atomsEqual(_selector, selector)) {
                    if (_selector.color !== selector.color) {
                        _selector.color = selector.color;
                        sel.update = true;
                    }

                    return false;
                }
            }
        }

        // This is a new item, add it to selections
        this.selections.push(ns);
        return true; // Return true to indicate that a new object has been added to selection
    }

    private async clearSelections() {
        const b = this.plugin.state.data.build();

        for (const sel of this.selections)
            sel.objects.forEach(o => b.delete(o.id));

        this.selections.splice(0, this.selections.length);

        await b.commit();
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
        const radius = (sphere.radius < 1 ? 1 : sphere.radius) * 8;

        const v = Vec3();
        const u = Vec3();
        Vec3.set(v, sphere.center[0], sphere.center[1], sphere.center[2]);
        Vec3.set(u, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        Vec3.sub(u, u, v);
        Vec3.normalize(u, u);
        Vec3.scale(u, u, radius);
        Vec3.add(v, u, v);

        snapshot.target = sphere.center;
        snapshot.position = v;
        snapshot.radius = radius;

        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
    }

    private getBuilder(id: IDs.ID, sub: IDs.Substructure | '' = '', ref = BaseRef) {
        return this.plugin.state.data.build().to(IDs.ID(id, sub, ref));
    }

    private getNucleicStructure() {
        const entireStruCell = this.plugin.state.data.cells.get(IDs.ID('structure', 'nucleic', BaseRef));
        if (!entireStruCell)
            return void 0;
        const stru = entireStruCell.obj!.data!;
        return Structure.toStructureElementLoci(stru);
    }

    private getStructureParent(cell: StateObjectCell) {
        if (!cell.sourceRef)
            return undefined;
        const parent = this.plugin.state.data.cells.get(cell.sourceRef);
        if (!parent)
            return undefined;
        return parent.obj?.type.name === 'Structure' ? parent.obj : undefined;
    }

    private ntcRef(ntc: string) {
        return rcref(ntc);
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
                const loci = Structure.toStructureElementLoci(parent.data);
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

        return {};
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
        if (!this.has('structure', 'nucleic', BaseRef))
            return;

        const b = this.plugin.state.data.build();
        if (!show) {
            for (const sel of this.selections) {
                for (const obj of sel.objects) {
                    if (obj.params.kind === 'visual')
                        b.delete(obj.id);
                }
            }

            b.delete(IDs.ID('visual', 'nucleic', BaseRef));
        } else {

            for (const sel of this.selections) {
                for (const obj of sel.objects) {
                    if (obj.params.kind === 'visual') {
                        b.to(obj.parentId)
                            .apply(
                                StateTransforms.Representation.StructureRepresentation3D,
                                obj.params.params.molstar,
                                { ref: obj.id }
                            );
                    }
                }
            }

            b.to(IDs.ID('structure-slice', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(visual),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
        }

        await b.commit();
    }

    private atomLoci(sel: Api.Payloads.AtomSelection, struLoci: StructureElement.Loci) {
        return Search.findAtom(sel.chain, sel.seqId, sel.altId, sel.insCode, sel.cifAtomId, struLoci, 'auth');
    }

    private residueLoci(sel: Api.Payloads.ResidueSelection, struLoci: StructureElement.Loci) {
        return Search.findResidue(sel.chain, sel.seqId, sel.altId, sel.insCode, struLoci, 'auth');
    }

    private stepLoci(name: string, struLoci: StructureElement.Loci): [loci: (StructureElement.Loci | EmptyLoci), altId: string] {
        const step = this.stepFromName(name);
        if (!step)
            return [EmptyLoci, ''];

        const altId = step.altId1 ? step.altId1 : step.altId2 ? step.altId2 : '';

        return [
            Search.findStep(
                step.chain,
                step.resNo1, step.altId1, step.insCode1,
                step.resNo2, step.altId2, step.insCode2,
                struLoci,
                'auth'
            ),
            altId
        ];
    }

    private async visualizeNucleicNotSelected(struLoci: StructureElement.Loci, selectedLocis: StructureElement.Loci[], display: Display) {
        const notSelected = structureSubtract(struLoci.structure, structureUnion(struLoci.structure, selectedLocis.map(x => x.structure)));
        const b = this.plugin.state.data.build().to(IDs.ID('structure', 'nucleic', BaseRef))
            .applyOrUpdate(
                IDs.ID('structure-slice', 'nucleic', BaseRef),
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: StructureElement.Bundle.fromSubStructure(struLoci.structure, notSelected), label: 'Not selected NA part of the structure' },
            );

        const vis = display.structures.nucleicRepresentation === 'ntc-tube'
            ? SubstructureVisual.NtC('ntc-tube', display.structures.conformerColors)
            : SubstructureVisual.BuiltIn(display.structures.nucleicRepresentation, Color(display.structures.chainColor));

        if (display.structures.showNucleic) {
            b.to(IDs.ID('structure-slice', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(vis),
                    { ref: IDs.ID('visual', 'nucleic', BaseRef) }
                );
        }

        await b.commit();
    }

    private async visualizeNucleic(updateNotSelected: boolean, struLoci: StructureElement.Loci, display: Display) {
        const NtCReferenceVisuals = (color: Color) => {
            return {
                type: { name: 'ball-and-stick', params: { sizeFactor: 0.15, aromaticBonds: false } },
                colorTheme: { name: 'uniform', params: { value: color } },
            };
        };
        const selectedLocis = [];

        let b = this.plugin.state.data.build();
        for (const sel of this.selections) {
            const type = sel.selector.type;
            let color = display.structures.chainColor;

            let altId = '';
            let loci: (EmptyLoci | StructureElement.Loci) = EmptyLoci;
            if (type === 'step') {
                const [_loci, _altId] = this.stepLoci(sel.selector.name, struLoci);
                loci = _loci; altId = _altId;
            } else if (type === 'residue') {
                loci = this.residueLoci(sel.selector, struLoci);
                color = Color(sel.selector.color);
                altId = sel.selector.altId;
            } else if (type === 'atom') {
                loci = this.atomLoci(sel.selector, struLoci);
                if (loci.kind !== 'empty-loci')
                    loci = Structure.toStructureElementLoci(StructureElement.Loci.toStructure(loci)); // Necessary to avoid selecting the entire struLoci
                // We're not setting altId because it makes no sense for a single atom
            }

            // Visualize the selected bit
            if (loci.kind !== 'element-loci') {
                console.warn(`No ElementLoci for selector ${sel.selector}`);
                continue;
            }

            // We need to use the "full" substructure (atoms in all altconfs) to carve out
            // the selected residue from the "remainder-slice".
            // However, we need to use the filtered (only the altconf we want) for display. Why am I putting up with this?
            selectedLocis.push(loci); // Push the unfilitered loci first
            loci = filterLociByAltId(altId, loci);

            // REVIEW: Can we safely skip processing of selections that already
            // have some objects associated with them?
            if (!(sel.objects.length === 0 || sel.update))
                continue;

            if (sel.update) {
                // Structure stays the same, only the representation might be different
                const objRef = sel.objects.find((x) => x.params.kind === 'visual' && x.primary)!.id;
                b.to(objRef)
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        (old) => ({ ...old, ...this.substructureVisuals(SubstructureVisual.BuiltIn('ball-and-stick', color)) })
                    );
            } else {
                const nuclStruRef = IDs.ID('structure', 'nucleic', BaseRef);
                const objRef = UUID.create22();
                b.to(nuclStruRef)
                    .apply(
                        StateTransforms.Model.StructureSelectionFromBundle,
                        { bundle: StructureElement.Bundle.fromSubStructure(struLoci.structure, loci.structure) },
                        { ref: objRef }
                    );
                sel.objects.push(StruObject(objRef, nuclStruRef, { kind: 'structure' }, true));

                const objRef2 = UUID.create22();
                const visualParams = this.substructureVisuals(SubstructureVisual.BuiltIn('ball-and-stick', color));

                if (display.structures.showNucleic) {
                    b.to(objRef)
                        .apply(
                            StateTransforms.Representation.StructureRepresentation3D,
                            visualParams,
                            { ref: objRef2 }
                        );
                }

                sel.objects.push(StruObject(objRef2, objRef, { kind: 'visual', params: { molstar: visualParams, useChainColor: true } }, true));
            }

            // If the selection is a step, it can have a reference we have to superpose.
            if (sel.selector.type === 'step' && sel.selector.reference) {
                const ntcRef = this.ntcRef(sel.selector.reference.NtC);

                if (sel.update) {
                    // We need to remove the entire reference because the reference model might have changed
                    for (const obj of sel.objects.filter((x) => !x.primary))
                        b.delete(obj.id);

                    sel.objects = sel.objects.filter((x) => x.primary);
                }

                let objRef = UUID.create22();
                b.to(IDs.ID('model', '', ntcRef))
                    .apply(StateTransforms.Model.StructureFromModel, {}, { ref: objRef });
                sel.objects.push(StruObject(objRef, ntcRef, { kind: 'structure' }, false));

                // Now we actually need to commit to get the added Structure object to appear in the state tree
                await b.commit();
                b = this.plugin.state.data.build();

                const refStru = this.plugin.state.data.cells.get(objRef)!.obj!;
                const refLoci = Structure.toStructureElementLoci(refStru.data);

                const { bTransform } = this.superpose(refLoci, loci);
                if (isNaN(bTransform[0])) {
                    console.warn(`Cannot superpose reference conformer ${ntcRef} onto selection`);
                } else {
                    let objRef2 = UUID.create22();

                    b.to(objRef)
                        .apply(
                            StateTransforms.Model.TransformStructureConformation,
                            { transform: { name: 'matrix', params: { data: bTransform, transpose: false } } },
                            { ref: objRef2 }
                        );
                    sel.objects.push(StruObject(objRef2, objRef, { kind: 'other' }, false));

                    objRef = objRef2;
                    objRef2 = UUID.create22();
                    const ntcVisualParams = NtCReferenceVisuals(Color(sel.selector.reference.color));

                    if (display.structures.showNucleic) {
                        b.to(objRef)
                            .apply(
                                StateTransforms.Representation.StructureRepresentation3D,
                                ntcVisualParams,
                                { ref: objRef2 }
                            );
                    }

                    sel.objects.push(StruObject(objRef2, objRef, { kind: 'visual', params: { molstar: ntcVisualParams, useChainColor: false } }, false));
                }
            }

            sel.update = false;
        }

        await b.commit();
        if (updateNotSelected)
            await this.visualizeNucleicNotSelected(struLoci, selectedLocis, display);

        return true;
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
                        onDeselected: () => interactCtx.self!.notifyStructureDeselected(),
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

        if (subs.includes('nucleic')) {
            for (const sel of this.selections) {
                for (const obj of sel.objects) {
                    if (obj.params.kind === 'visual' && obj.params.params.useChainColor) {
                        b.to(obj.id)
                            .update(
                                StateTransforms.Representation.StructureRepresentation3D,
                                old => ({
                                    ...old,
                                    ...this.substructureVisuals(SubstructureVisual.BuiltIn('ball-and-stick', display.structures.chainColor)),
                                })
                            );
                    };
                }
            }
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
            if (this.has('visual', 'nucleic', BaseRef)) {
                b.to(IDs.ID('visual', 'nucleic', BaseRef))
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

    focusOnSelection(sel: Api.Payloads.StructureSelection) {
        let focusOn;

        for (const struSel of this.selections) {
            if (sel.type === struSel.selector.type) {
                if (sel.type === 'step') {
                    const selector = struSel.selector as Api.Payloads.StepSelection;

                    if (sel.name === selector.name) {
                        for (const obj of struSel.objects) {
                            if (obj.params.kind === 'structure') {
                                const stru = this.plugin.state.data.cells.get(obj.id)!.obj!.data;
                                if (!focusOn) {
                                    focusOn = Structure.toStructureElementLoci(stru);
                                } else
                                    StructureElement.Loci.union(focusOn, Structure.toStructureElementLoci(stru));
                            }
                        }

                        break;
                    }
                } else if (sel.type === 'residue') {
                    const selector = struSel.selector as Api.Payloads.ResidueSelection;
                    if (residuesEqual(sel, selector)) {
                        for (const obj of struSel.objects) {
                            if (obj.params.kind === 'structure') {
                                const stru = this.plugin.state.data.cells.get(obj.id)!.obj!.data;
                                focusOn = Structure.toStructureElementLoci(stru);
                                break;
                            }
                        }

                        break;
                    }
                }
            }
        }

        if (focusOn)
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

    getSelections() {
        return this.selections.map(x => x.selector);
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
        display: Display,
        modelNumber: number
    ) {
        // TODO: Remove the currently loaded structure

        this.selections.splice(0, this.selections.length);

        const chainColor = Color(display.structures.chainColor);
        const waterColor = Color(display.structures.waterColor);

        const b = (t => coords.type === 'pdb'
            ? t.apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
            : t.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: IDs.ID('trajectory', '', BaseRef) })
        )(this.plugin.state.data.build().toRoot().apply(RawData, { data: coords.data }, { ref: IDs.ID('data', '', BaseRef) }))
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: modelNumber - 1 }, { ref: IDs.ID('model', '', BaseRef) }) // WARNING: The modelNumber - 1 is a major hack!!!
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

        const nucl = this.getNucleicStructure();
        if (nucl)
            await this.visualizeNucleicNotSelected(nucl, [], display);

        const b3 = this.plugin.state.data.build();
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
                .apply(StateTransforms.Model.ModelFromTrajectory, {}, { ref: mRef });
        }

        await b.commit();
    }

    notifyResidueSelected(desc: Residue.Description) {
        this.app.viewerResidueSelected(desc);
    }

    notifyStructureDeselected() {
        this.app.viewerStructureDeselected();
    }

    notifyStepSelected(name: string) {
        this.app.viewerStepSelected(name);
    }

    async onLociSelected(selected: Representation.Loci) {
        const granularity = this.plugin.managers.interactivity.props.granularity;

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
            } else if (selected.loci.kind === 'element-loci') {
                if (granularity === 'two-residues')
                    return Loci.normalize(selected.loci, 'two-residues');
                else if (granularity === 'residue')
                    return Loci.normalize(selected.loci, 'residue');
                return EmptyLoci;
            } else
                return EmptyLoci;
        })();

        if (normalized.kind === 'element-loci') {
            if (granularity === 'two-residues') {
                const desc = Step.describe(normalized, this.haveMultipleModels);
                if (desc && this.stepNames.has(desc.name))
                    this.notifyStepSelected(desc.name);
            } else if (granularity === 'residue') {
                const desc = Residue.describe(normalized);
                this.notifyResidueSelected(desc);
            }
        }
    }

    async actionApplyFilter(filter: Filters.All, display: Display) {
        await this.clearSelections();

        const b = this.plugin.state.data.build();

        const haveNucl = this.has('structure', 'nucleic', BaseRef);
        if (haveNucl) {
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

        if (haveNucl) {
            const struLoci = this.getNucleicStructure()!;
            await this.visualizeNucleic(true, struLoci, display);
        }

        return true;
    }

    async actionDeselectStructures(display: Display) {
        await this.clearSelections();

        const struLoci = this.getNucleicStructure();
        if (struLoci)
            await this.visualizeNucleic(true, struLoci, display);
    }

    async actionHighlight(highlights: Api.Payloads.AtomSelection[]) {
        const struLoci = this.getNucleicStructure();
        if (!struLoci)
            return;

        let toHighlight;
        for (const hl of highlights) {
            const loci = Search.findAtom(hl.chain, hl.seqId, hl.altId, hl.insCode, hl.cifAtomId, struLoci, 'auth');
            if (loci.kind === 'empty-loci')
                continue;

            if (!toHighlight)
                toHighlight = loci;
            else
                toHighlight = StructureElement.Loci.union(toHighlight, loci);
        }

        if (toHighlight)
            this.plugin.managers.interactivity.lociHighlights.highlight({ loci: toHighlight }, false);
    }

    async actionSelectStructures(selections: Api.Commands.StructureSelection[], display: Display) {
        const struLoci = this.getNucleicStructure();
        if (!struLoci)
            return [];

        // First we need to check that all selections use the same model
        let modelNum;
        for (const sel of selections) {
            let m;

            if (sel.type === 'step') {
                const step = this.stepFromName(sel.step.name);
                if (step)
                    m = step.model;
            } else if (sel.type === 'residue') {
                m = sel.residue.modelNum;
            } else if (sel.type === 'atom') {
                m = sel.atom.modelNum;
            }

            if (modelNum === undefined)
                modelNum = m;
            else if (modelNum !== m) {
                console.warn('Requested structure selections references multiple models. This is not allowed.');
                return [];
            }
        }

        if (modelNum === undefined) {
            console.warn('Requested structure selection does not refererence any model.');
            return [];
        }
        this.switchModel(modelNum);

        const succeeded = [];
        let selectionExtended = false;
        for (const sel of selections) {
            if (sel.type === 'step') {
                const step = this.stepFromName(sel.step.name);
                if (step) {
                    const prevLoci = sel.prev ? this.stepLoci(sel.prev.name, struLoci)[0] : EmptyLoci;
                    const nextLoci = sel.next ? this.stepLoci(sel.next.name, struLoci)[0] : EmptyLoci;

                    this.addSelection(StruSelection(sel.step)); // Expect that the "stepFromName" check ensures that the step is present in the structure
                    succeeded.push(sel.step);

                    if (prevLoci.kind === 'element-loci') {
                        selectionExtended = this.addSelection(StruSelection(sel.prev!)) || selectionExtended;
                        succeeded.push(sel.prev!);
                    }

                    if (nextLoci.kind === 'element-loci') {
                        selectionExtended = this.addSelection(StruSelection(sel.next!)) || selectionExtended;
                        succeeded.push(sel.next!);
                    }
                }
            } else if (sel.type === 'residue') {
                const residue = sel.residue;
                const residueLoci = Search.findResidue(residue.chain, residue.seqId, residue.altId, residue.insCode, struLoci, 'auth');
                if (residueLoci.kind === 'element-loci') {
                    selectionExtended = this.addSelection(StruSelection(residue)) || selectionExtended;
                    succeeded.push(residue);
                }
            } else if (sel.type === 'atom') {
                const atom = sel.atom;
                const atomLoci = Search.findAtom(atom.chain, atom.seqId, atom.altId, atom.insCode, atom.cifAtomId, struLoci, 'auth');
                if (atomLoci.kind === 'element-loci') {
                    selectionExtended = this.addSelection(StruSelection(atom)) || selectionExtended;
                    succeeded.push(atom);
                }
            }
        }

        await this.visualizeNucleic(selectionExtended, struLoci, display);

        return succeeded;
    }

    async actionSwitchSelectionGranularity(granularity: Api.Commands.SwitchSelectionGranularity['granularity']) {
        this.plugin.managers.interactivity.setProps({ granularity });
    }

    async actionUnhighlight() {
        this.plugin.managers.interactivity.lociHighlights.clearHighlights();
    }

    redraw() {
        setTimeout(
            () => window.dispatchEvent(new Event('resize')),
            0
        );
    }

    async switchModel(modelNumber?: number) {
        if (modelNumber !== undefined && modelNumber === this.currentModelNumber())
            return;

        await this.clearSelections();

        // Convert model number to model index.
        // Having to do THIS to get a model index from pdbx_PDB_model_num is insane
        const obj = this.plugin.state.data.cells.get(IDs.ID('trajectory', '', BaseRef))?.obj;
        if (!obj)
            return;

        let modelIndex = -1;
        const trajData = (obj as StateObject<Trajectory>).data;
        for (let idx = 0; idx < trajData.frameCount; idx++) {
            const m = await Task.resolveInContext(trajData.getFrameAtIndex(idx));
            if (modelNumber === m.modelNum) {
                modelIndex = idx;
                break;
            }
        }
        if (modelIndex < 0)
            return;

        const b = this.plugin.state.data.build()
            .to(IDs.ID('model', '', BaseRef))
            .update(
                StateTransforms.Model.ModelFromTrajectory,
                old => ({
                    ...old,
                    modelIndex,
                })
            );

        await b.commit();
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
