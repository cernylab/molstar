import * as IDs from './idents';
import { ReDNATCOMspApi as Api } from './api';
import { ReDNATCOMsp, Display, VisualRepresentations } from './index';
import { NtCColors } from './colors';
import { Filters } from './filters';
import { Filtering } from './filtering';
import { type NtCs, isKnownBase, referenceAtoms } from './reference-conformers';
import { referencePdb } from './reference-conformers-pdbs';
import { Residue } from './residue';
import { Search } from './search';
import { Step } from './step';
import { Superpose } from './superpose';
import { isoBounds, prettyIso } from './util';
import { BasePairs } from '../../extensions/base-pairs';
import { BasePairs as BasePairsProp, setExternalPairings } from '../../extensions/base-pairs/property';
import { BasePairsTypes } from '../../extensions/base-pairs/types';
import { BasePairsLadderTypes } from '../../extensions/base-pairs/ladder/types';
import { DnatcoNtCs } from '../../extensions/dnatco';
import { DnatcoTypes } from '../../extensions/dnatco/types';
import { NtCTubeTypes } from '../../extensions/dnatco/ntc-tube/types';
import { ConfalPyramidsParams } from '../../extensions/dnatco/confal-pyramids/representation';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { Sphere3D } from '../../mol-math/geometry';
import { BoundaryHelper } from '../../mol-math/geometry/boundary-helper';
import { SymmetryOperator } from '../../mol-math/geometry/symmetry-operator';
import { Vec3 } from '../../mol-math/linear-algebra/3d';
import { EmptyLoci, Loci } from '../../mol-model/loci';
import { ElementIndex, Model, Structure, StructureElement, StructureProperties, Trajectory } from '../../mol-model/structure';
import { Volume } from '../../mol-model/volume';
import { structureUnion, structureSubtract } from '../../mol-model/structure/query/utils/structure-set';
import { Location } from '../../mol-model/structure/structure/element/location';
import { MmcifFormat } from '../../mol-model-formats/structure/mmcif';
import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { PluginBehavior, PluginBehaviors } from '../../mol-plugin/behavior';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginContext } from '../../mol-plugin/context';
import { PluginSpec } from '../../mol-plugin/spec';
import { LociLabel } from '../../mol-plugin-state/manager/loci-label';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { StateTransforms } from '../../mol-plugin-state/transforms';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { RawData } from '../../mol-plugin-state/transforms/data';
import { createPluginUI } from '../../mol-plugin-ui';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { renderReact18 } from '../../mol-plugin-ui/react18';
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
import './output.css';

const Extensions = {
    'base-pairs': PluginSpec.Behavior(BasePairs),
    'ntcs': PluginSpec.Behavior(DnatcoNtCs),
};

const AnimationDurationMsec = 150;
const BaseRef = 'rdo';
const RCRef = 'rc';

const SphereBoundaryHelper = new BoundaryHelper('98');
function getBoundingSphere(locis: Representation.Loci[]) {
    SphereBoundaryHelper.reset();
    for (const loci of locis) {
        const sphere = Loci.getBoundingSphere(loci.loci);
        if (sphere)
            SphereBoundaryHelper.includeSphere(sphere);
    }
    SphereBoundaryHelper.finishedIncludeStep();
    for (const loci of locis) {
        const sphere = Loci.getBoundingSphere(loci.loci);
        if (sphere)
            SphereBoundaryHelper.radiusSphere(sphere);
    }

    return SphereBoundaryHelper.getSphere();
}

export function filterLoci(filters: { seqId: number, altId: string, insCode: string }[], loci: StructureElement.Loci) {
    if (filters.length === 0)
        return loci;

    const _loc = StructureElement.Location.create();
    _loc.structure = loci.structure;

    let filteredLoci = StructureElement.Loci(loci.structure, []);

    // Process all elements, not just the first one (important for base pairs in different chains/units)
    for (const e of loci.elements) {
        const N = OrderedSet.size(e.indices);

        for (let idx = 0; idx < N; idx++) {
            const uI = OrderedSet.getAt(e.indices, idx);

            for (const unit of loci.structure.units) {
                _loc.unit = unit;
                _loc.element = OrderedSet.getAt(_loc.unit.elements, uI);

                for (const { seqId, altId, insCode } of filters) {
                    const _seqId = StructureProperties.residue.auth_seq_id(_loc);
                    const _altId = StructureProperties.atom.label_alt_id(_loc);
                    const _insCode = StructureProperties.residue.pdbx_PDB_ins_code(_loc);

                    if ((_altId === '' || altId === _altId) && _seqId === seqId && _insCode === insCode) {
                        const l = StructureElement.Loci(
                            loci.structure,
                            [{ unit, indices: OrderedSet.ofSortedArray([uI]) }]
                        );
                        filteredLoci = StructureElement.Loci.union(filteredLoci, l);
                        break;
                    }
                }
            }
        }
    }

    const result = Structure.toStructureElementLoci(StructureElement.Loci.toStructure(filteredLoci));
    return result;
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
    const atoms1 = referenceAtoms(compId1.toUpperCase(), 'first');
    if (!gather(atoms1, 0, secondIdx)) {
        console.log('No ref atoms for first');
        return [];
    }

    // Gather element indices for the second residue
    loc.element = es.unit.elements[OrderedSet.getAt(es.indices, secondIdx)];
    const compId2 = StructureProperties.atom.label_comp_id(loc);
    const atoms2 = referenceAtoms(compId2.toUpperCase(), 'second');
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
                        return lociLabel(loci);
                    case 'element-loci':
                        // Use context-aware granularity:
                        // - For data-loci (tubes, ladders), they have their own getLabel
                        // - For element-loci, check if it's a two-residue selection
                        const stats = StructureElement.Stats.ofLoci(loci);
                        const useTwoResidues = stats.residueCount === 2 && stats.elementCount === 0;
                        const granularity = useTwoResidues ? 'two-residues' : 'residue';
                        return lociLabel(loci, { granularity });
                    case 'data-loci':
                        // Data loci (tubes, ladders) use their own getLabel function
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
    onDeselected: PD.Value(() => { }, { isHidden: true }),
    onSelected: PD.Value((loci: Representation.Loci) => { }, { isHidden: true }),
};
type ReDNATCOLociSelectionProps = PD.Values<typeof ReDNATCOLociSelectionParams>;

const ReDNATCOLociSelectionProvider = PluginBehavior.create({
    name: 'rednatco-loci-selection-provider',
    category: 'interaction',
    display: { name: 'Interactive step selection' },
    params: () => ReDNATCOLociSelectionParams,
    ctor: class extends PluginBehavior.Handler<ReDNATCOLociSelectionProps> {
        private focusOnLoci(locis: Representation.Loci[]) {
            if (!this.ctx.canvas3d)
                return;

            const snapshot = this.ctx.canvas3d.camera.getSnapshot();
            snapshot.target = getBoundingSphere(locis).center;

            PluginCommands.Camera.SetSnapshot(this.ctx, { snapshot, durationMs: AnimationDurationMsec });
        }
        register() {
            const lociIsEmpty = (current: Representation.Loci) => Loci.isEmpty(current.loci);
            const lociIsNotEmpty = (current: Representation.Loci) => !Loci.isEmpty(current.loci);

            const actions: [keyof typeof ReDNATCOLociSelectionBindings, (current: Representation.Loci) => void, ((current: Representation.Loci) => boolean) | undefined][] = [
                ['clickFocus', current => this.focusOnLoci([current]), lociIsNotEmpty],
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
    kind: 'data' | 'model' | 'structure' | 'other',
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

function basePairsEqual(a: Api.Payloads.BasePairSelection, b: Api.Payloads.BasePairSelection) {
    return (
        a.modelNum === b.modelNum &&
        a.asymId1 === b.asymId1 &&
        a.seqId1 === b.seqId1 &&
        a.insCode1 === b.insCode1 &&
        a.asymId2 === b.asymId2 &&
        a.seqId2 === b.seqId2 &&
        a.insCode2 === b.insCode2
    );
}

export class ReDNATCOMspViewer {
    private haveMultipleModels = false;
    private steps: Step.ExtendedDescription[] = [];
    private stepNames: Map<string, number> = new Map();
    private app: ReDNATCOMsp;
    private selections = new Array<StruSelection>();
    private hydrogensInReferences;
    private basePairsLadderOptions;
    private ntcTubeAlpha: number;
    private pyramidAlpha: number;
    private pairingLadderAlpha: number;
    private showNtcTubeSegmentForSelectedResidues: boolean;
    private cameraRadiusFactor: number;
    private cameraClippingRadius: number;
    private cameraClippingFar: boolean;
    private cameraClippingMinNear: number;
    private lastClickedBasePair?: BasePairsTypes.BasePair;
    private availableAssemblies: Api.AssemblyInfo[] = [];
    private activeAssemblies: string[] = [''];
    private customSurroundingsRef: string | undefined;

    constructor(public plugin: PluginUIContext, interactionContext: { self?: ReDNATCOMspViewer }, options: Partial<Api.Options>, app: ReDNATCOMsp) {
        interactionContext.self = this;
        this.app = app;
        this.hydrogensInReferences = options.hydrogensInReferences ?? false;
        this.basePairsLadderOptions = options.basePairsLadder;
        this.ntcTubeAlpha = options.ntcTubeAlpha ?? 0.5;
        this.pyramidAlpha = options.pyramidAlpha ?? 0.5;
        this.pairingLadderAlpha = options.pairingLadderAlpha ?? 0.5;
        this.showNtcTubeSegmentForSelectedResidues = options.showNtcTubeSegmentForSelectedResidues ?? true;
        this.cameraRadiusFactor = options.cameraRadiusFactor ?? 3;
        this.cameraClippingRadius = options.cameraClippingRadius ?? 100;
        this.cameraClippingFar = options.cameraClippingFar ?? true;
        this.cameraClippingMinNear = options.cameraClippingMinNear ?? 5;

        this.plugin.canvas3d?.setProps({
            renderer: {
                highlightColor: options.highlightColor ? Color(options.highlightColor) : Color(0x49ff92),
            },
            marking: {
                highlightEdgeColor: options.highlightColor ? Color(options.highlightColor) : Color(0x49ff92),
                highlightEdgeStrength: options.highlightThickness ? options.highlightThickness : 2.0,
            },
            camera: {
                mode: 'orthographic',
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
        } else if (selector.type === 'base-pair') {
            for (const sel of this.selections) {
                if (sel.selector.type !== 'base-pair')
                    continue;

                const _selector = sel.selector;
                if (basePairsEqual(_selector, selector)) {
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

    private focusOnLocis(locis: StructureElement.Loci[]) {
        if (!this.plugin.canvas3d)
            return;

        const bSphere = getBoundingSphere(locis.map((l) => ({ loci: l })));
        this.repositionCamera(bSphere);
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

    private pyramidsParams(colors: NtCColors.Conformers, visible: Map<string, boolean>, transparent: boolean) {
        const typeParams = {} as PD.Values<ConfalPyramidsParams>;
        for (const k of Reflect.ownKeys(ConfalPyramidsParams) as (keyof ConfalPyramidsParams)[]) {
            if (ConfalPyramidsParams[k].type === 'boolean')
                (typeParams[k] as any) = visible.get(k) ?? ConfalPyramidsParams[k]['defaultValue'];
        }

        return {
            type: { name: 'confal-pyramids', params: { ...typeParams, alpha: transparent ? this.pyramidAlpha : 1.0 } },
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

    private basePairsLadderParams(display: Display) {
        const theme = display.structures.showSimpleTheme ? 'base-pairs-ladder-simple' : 'base-pairs-ladder-detailed';

        // Check if any residues/steps/base pairs are selected - if so, make the ENTIRE ladder semi-transparent
        // This ensures the ladder becomes transparent when tube is clicked (step selected) or ladder is clicked (base pair selected)
        // Note: Per-stick transparency would require mesh-level transparency data which is more complex
        const hasSelections = this.selections.length > 0;

        // Merge config options with display settings (display settings take precedence for show flags)
        const params = {
            ...(this.basePairsLadderOptions || {}),
            showPairs: display.structures.showPairedBases,
            showUnpaired: display.structures.showUnpairedBases,
            // Make whole ladder semi-transparent when any residues are selected to reduce visual clutter
            // Use config value for alpha (alpha must be >= 0.5 to keep hover/picking working properly)
            alpha: hasSelections ? this.pairingLadderAlpha : 1.0
        };

        return {
            type: {
                name: 'base-pairs-ladder',
                params
            },
            colorTheme: {
                name: theme,
                params: {},
            },
        };
    }

    private repositionCamera(boundingSphere: Sphere3D) {
        const snapshot = this.plugin.canvas3d!.camera.getSnapshot();
        // Use the camera radius factor from config to control the zoom level
        // Higher values zoom out more, lower values zoom in closer
        const radius = (boundingSphere.radius < 1 ? 1 : boundingSphere.radius) * this.cameraRadiusFactor;

        const v = Vec3();
        const u = Vec3();
        Vec3.set(v, boundingSphere.center[0], boundingSphere.center[1], boundingSphere.center[2]);
        Vec3.set(u, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        Vec3.sub(u, u, v);
        Vec3.normalize(u, u);
        Vec3.scale(u, u, radius);
        Vec3.add(v, u, v);

        snapshot.target = boundingSphere.center;
        snapshot.position = v;
        snapshot.radius = radius;

        // Apply camera clipping when zooming in on selected residues
        this.plugin.canvas3d?.setProps({
            cameraClipping: {
                radius: this.cameraClippingRadius,
                far: this.cameraClippingFar,
                minNear: this.cameraClippingMinNear,
            }
        });

        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
    }

    private resetCamera() {
        if (!this.plugin.canvas3d)
            return;

        const locis = [];
        for (const [ref, cell] of Array.from(this.plugin.state.data.cells)) {
            if (!IDs.isVisual(ref))
                continue;
            const parent = this.getStructureParent(cell);
            if (parent)
                locis.push(Structure.toStructureElementLoci(parent.data));
        }

        if (locis.length < 1)
            return;

        // Reset camera clipping to default values when resetting camera
        this.plugin.canvas3d?.setProps({
            cameraClipping: {
                radius: 100,
                far: true,
                minNear: 5,
            }
        });

        const bSphere = getBoundingSphere(locis.map((l) => ({ loci: l })));
        const snapshot = this.plugin.canvas3d!.camera.getSnapshot();
        const radius = (bSphere.radius < 1 ? 1 : bSphere.radius) * this.cameraRadiusFactor;

        const v = Vec3();
        const u = Vec3();
        Vec3.set(v, bSphere.center[0], bSphere.center[1], bSphere.center[2]);
        Vec3.set(u, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        Vec3.sub(u, u, v);
        Vec3.normalize(u, u);
        Vec3.scale(u, u, radius);
        Vec3.add(v, u, v);

        snapshot.target = bSphere.center;
        snapshot.position = v;
        snapshot.radius = radius;

        PluginCommands.Camera.SetSnapshot(this.plugin, { snapshot, durationMs: AnimationDurationMsec });
    }

    private stepFromName(name: string) {
        const idx = this.stepNames.get(name);
        if (idx === undefined)
            return undefined;

        return this.steps[idx];
    }

    private substructureVisuals(visual: SubstructureVisual.Types, applyTransparency: boolean = false) {
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
                                // excludeTypes: ['hydrogen-bond', 'aromatic'],
                                excludeTypes: ['hydrogen-bond'],
                                aromaticBonds: false,
                            },
                        },
                        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'uniform', params: visual.color } } },
                    };
            }
        } else if (visual.type === 'ntc') {
            switch (visual.repr) {
                case 'ntc-tube':
                    return {
                        type: {
                            name: 'ntc-tube',
                            params: {
                                alpha: applyTransparency ? this.ntcTubeAlpha : 1.0
                            },
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

    private superpose(reference: StructureElement.Loci, stru: StructureElement.Loci, targetConformation: SymmetryOperator.ArrayMapping<ElementIndex>) {
        const refElems = superpositionAtomsIndices(reference);
        const struElems = superpositionAtomsIndices(stru);

        return Superpose.superposition(
            { elements: refElems, conformation: reference.elements[0].unit.conformation },
            { elements: struElems, conformation: targetConformation }
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

            // Apply transparency to NtC tube when residues are selected
            const hasSelections = this.selections.length > 0;

            b.to(IDs.ID('structure-slice', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(visual, hasSelections),
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

    private stepLoci(name: string, struLoci: StructureElement.Loci): [loci: (StructureElement.Loci | EmptyLoci), step: Step.ExtendedDescription | null] {
        const step = this.stepFromName(name);
        if (!step)
            return [EmptyLoci, null];

        return [
            Search.findStep(
                step.chain,
                step.resNo1, step.altId1, step.insCode1,
                step.resNo2, step.altId2, step.insCode2,
                struLoci,
                'auth'
            ),
            step,
        ];
    }

    private async visualizeNucleicNotSelected(struLoci: StructureElement.Loci, selectedLocis: StructureElement.Loci[], display: Display) {
        // If showNtcTubeSegmentForSelectedResidues is true, show the entire structure
        // Otherwise, subtract selected residues to hide those tube segments
        const structureToShow = this.showNtcTubeSegmentForSelectedResidues
            ? struLoci.structure
            : structureSubtract(struLoci.structure, structureUnion(struLoci.structure, selectedLocis.map(x => x.structure)));

        const label = this.showNtcTubeSegmentForSelectedResidues
            ? 'NA structure (full tube including selected residues)'
            : 'Not selected NA part of the structure';

        const b = this.plugin.state.data.build().to(IDs.ID('structure', 'nucleic', BaseRef))
            .applyOrUpdate(
                IDs.ID('structure-slice', 'nucleic', BaseRef),
                StateTransforms.Model.StructureSelectionFromBundle,
                { bundle: StructureElement.Bundle.fromSubStructure(struLoci.structure, structureToShow), label },
            );

        const vis = display.structures.nucleicRepresentation === 'ntc-tube'
            ? SubstructureVisual.NtC('ntc-tube', display.structures.conformerColors)
            : SubstructureVisual.BuiltIn(display.structures.nucleicRepresentation, Color(display.structures.chainColor));

        // Apply transparency to NtC tube when residues are selected (shown as ball-and-stick)
        const hasSelections = this.selections.length > 0;

        if (display.structures.showNucleic) {
            b.to(IDs.ID('structure-slice', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.substructureVisuals(vis, hasSelections),
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

            const lociFilters = [];
            let loci: (EmptyLoci | StructureElement.Loci) = EmptyLoci;
            if (type === 'step') {
                const [_loci, step] = this.stepLoci(sel.selector.name, struLoci);
                loci = _loci;
                if (step) {
                    lociFilters.push({ seqId: step.resNo1, altId: step.altId1 ?? '', insCode: step.insCode1 });
                    lociFilters.push({ seqId: step.resNo2, altId: step.altId2 ?? '', insCode: step.insCode2 });
                }
            } else if (type === 'residue') {
                loci = this.residueLoci(sel.selector, struLoci);
                color = Color(sel.selector.color);
                lociFilters.push({ seqId: sel.selector.seqId, altId: sel.selector.altId, insCode: sel.selector.insCode });
            } else if (type === 'atom') {
                loci = this.atomLoci(sel.selector, struLoci);
                if (loci.kind !== 'empty-loci')
                    loci = Structure.toStructureElementLoci(StructureElement.Loci.toStructure(loci)); // Necessary to avoid selecting the entire struLoci
                // We're not setting any loci filters because it makes no sense for a single atom
            } else if (type === 'base-pair') {
                const bp = sel.selector as Api.Payloads.BasePairSelection;

                // Find both residues and create a union loci
                const residue1Loci = Search.findResidue(
                    bp.asymId1,
                    bp.seqId1,
                    bp.altId1,
                    bp.insCode1,
                    struLoci,
                    'label'
                );

                const residue2Loci = Search.findResidue(
                    bp.asymId2,
                    bp.seqId2,
                    bp.altId2,
                    bp.insCode2,
                    struLoci,
                    'label'
                );

                if (residue1Loci.kind === 'element-loci' && residue2Loci.kind === 'element-loci') {
                    // Use structureUnion like findStep does, instead of StructureElement.Loci.union
                    const union = structureUnion(struLoci.structure, [
                        StructureElement.Loci.toStructure(residue1Loci),
                        StructureElement.Loci.toStructure(residue2Loci)
                    ]);
                    loci = Structure.toStructureElementLoci(union);

                    color = Color(bp.color);
                    lociFilters.push({ seqId: bp.authSeqId1, altId: bp.altId1, insCode: bp.insCode1 });
                    lociFilters.push({ seqId: bp.authSeqId2, altId: bp.altId2, insCode: bp.insCode2 });
                } else {
                    console.warn('[Viewer.visualizeNucleic] Could not create loci for base pair');
                }
            }

            // Visualize the selected bit
            if (loci.kind !== 'element-loci') {
                console.warn(`No ElementLoci for selector ${sel.selector}`);
                continue;
            }

            // We need to use the "full" substructure (atoms in all altconfs) to carve out
            // the selected residue from the "remainder-slice".
            // However, we need to use the filtered (only the altconfs we want) for display. Why am I putting up with this?
            selectedLocis.push(loci); // Push the unfilitered loci first
            loci = filterLoci(lociFilters, loci);

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
                if (sel.update) {
                    // We need to remove the entire reference because the reference model might have changed
                    for (const obj of sel.objects.filter((x) => !x.primary))
                        b.delete(obj.id);

                    sel.objects = sel.objects.filter((x) => x.primary);
                }

                const stepDesc = Step.fromName(sel.selector.name)!;
                if (isKnownBase(stepDesc.compId1) && isKnownBase(stepDesc.compId2)) {
                    // Create the reference step model based on the bases that make up the step
                    const pdbData = referencePdb(sel.selector.reference.NtC as NtCs, stepDesc.compId1, stepDesc.compId2, this.hydrogensInReferences);
                    const ntcRef = rcref(sel.selector.name);
                    const dRef = IDs.ID('data', '', ntcRef);
                    const mRef = IDs.ID('model', '', ntcRef);

                    b.toRoot()
                        .apply(RawData, { data: pdbData, label: `Reference ${sel.selector.reference.NtC}` }, { ref: dRef })
                        .apply(StateTransforms.Model.TrajectoryFromPDB, {})
                        .apply(StateTransforms.Model.ModelFromTrajectory, {}, { ref: mRef });

                    sel.objects.push(StruObject(dRef, '', { kind: 'data' }, false));
                    sel.objects.push(StruObject(mRef, dRef, { kind: 'model' }, false));

                    // Commit now so that we can access the model
                    await b.commit();
                    b = this.plugin.state.data.build();

                    for (const unit of loci.structure.units) {
                        // Create a new reference structure for each unit we want to superpose onto
                        let objRef = UUID.create22();
                        b.to(mRef)
                            .apply(StateTransforms.Model.StructureFromModel, {}, { ref: objRef });
                        sel.objects.push(StruObject(objRef, mRef, { kind: 'structure' }, false));

                        // Now we actually need to commit to get the added Structure object to appear in the state tree
                        await b.commit();
                        b = this.plugin.state.data.build();

                        const refStru = this.plugin.state.data.cells.get(objRef)!.obj!;
                        const refLoci = Structure.toStructureElementLoci(refStru.data);

                        const { bTransform } = this.superpose(refLoci, loci, unit.conformation);
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
                }
            }

            sel.update = false;
        }

        await b.commit();
        if (updateNotSelected)
            await this.visualizeNucleicNotSelected(struLoci, selectedLocis, display);

        // Update ladder transparency when base pairs are selected/deselected
        if (display.structures.showBasePairsLadder && this.has('base-pairs-ladder', 'nucleic')) {
            await this.changeBasePairsLadder(display);
        }

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

    private ligandVisuals() {
        return {
            type: {
                name: 'ball-and-stick',
                params: { sizeFactor: 0.2, sizeAspectRatio: 0.35, aromaticBonds: false },
            },
            colorTheme: { name: 'element-symbol', params: {} },
        };
    }

    static async create(target: HTMLElement, options: Partial<Api.Options>, app: ReDNATCOMsp) {
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

        const plugin = await createPluginUI({ target, render: renderReact18, spec });

        plugin.managers.interactivity.setProps({ granularity: 'two-residues' });
        plugin.selectionMode = true;

        return new ReDNATCOMspViewer(plugin, interactCtx, options, app);
    }

    areBasePairsAvailable() {
        const obj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (!obj)
            return false;
        const struModel = (obj as StateObject<Model>);
        return BasePairsProp.isApplicable(struModel.data);
    }

    async changeChainColor(subs: IDs.Substructure[], display: Display) {
        const b = this.plugin.state.data.build();

        // Apply transparency to NtC tube when residues are selected
        const hasSelections = this.selections.length > 0;

        for (const sub of subs) {
            const vis = visualForSubstructure(sub, display);

            if (this.has('visual', sub)) {
                b.to(IDs.ID('visual', sub, BaseRef))
                    .update(
                        StateTransforms.Representation.StructureRepresentation3D,
                        old => ({
                            ...old,
                            ...this.substructureVisuals(vis, hasSelections),
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

    async changeBasePairsLadder(display: Display) {
        if (display.structures.showBasePairsLadder) {
            if (!this.has('base-pairs-ladder', 'nucleic')) {
                const b = this.getBuilder('structure', 'nucleic');
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.basePairsLadderParams(display),
                        { ref: IDs.ID('base-pairs-ladder', 'nucleic', BaseRef) }
                    );
                    await b.commit();
                }
            } else {
                const b = this.getBuilder('base-pairs-ladder', 'nucleic');
                b.update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.basePairsLadderParams(display),
                    })
                );
                await b.commit();
            }
        } else
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('base-pairs-ladder', 'nucleic', BaseRef) });
    }

    async setExternalBasePairs(payload: Api.Payloads.ExternalBasePairsData | null, display: Display) {
        if (payload === null) {
            setExternalPairings(undefined);
        } else {
            // Look up entity_id for each asym_id from the loaded model
            const modelObj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
            const model = modelObj ? (modelObj as StateObject<Model>).data : undefined;

            const asymToEntity = new Map<string, string>();
            if (model) {
                const ah = model.atomicHierarchy;
                for (let c = 0; c < ah.chains._rowCount; c++) {
                    asymToEntity.set(ah.chains.label_asym_id.value(c), ah.chains.label_entity_id.value(c));
                }
            }

            const ComplementaryBases = [['A','U'],['C','G'],['DA','DT'],['DC','DG']];
            const isCoding = (a: string, b: string, orient: string, edge1: string, edge2: string) =>
                orient === 'cis' && edge1 === 'watson-crick' && edge2 === 'watson-crick' &&
                ComplementaryBases.some(([pa, pb]) => (pa === a && pb === b) || (pa === b && pb === a));

            const toEdge = (e: string): BasePairsTypes.BaseEdge => {
                const el = e.toLowerCase();
                if (el === 'watson-crick') return 'watson-crick';
                if (el === 'hoogsteen') return 'hoogsteen';
                return 'sugar';
            };
            const toOrientation = (o: string): 'cis' | 'trans' =>
                o.length > 0 && o[0].toLowerCase() === 'c' ? 'cis' : 'trans';

            const items: BasePairsTypes.Item[] = [];
            const mapping: BasePairsTypes.AsymIdMap[] = [];

            const addToMapping = (modelNum: number, asym_id: string, seq_id: number) => {
                const modelIdx = modelNum - 1;
                if (!mapping[modelIdx]) mapping[modelIdx] = new Map();
                const seqMap = mapping[modelIdx].get(asym_id) ?? new Map<number, number[]>();
                const indices = seqMap.get(seq_id) ?? [];
                indices.push(items.length - 1);
                seqMap.set(seq_id, indices);
                mapping[modelIdx].set(asym_id, seqMap);
            };

            for (const pair of payload.pairs) {
                const orient = toOrientation(pair.orientation);
                const edge1 = toEdge(pair.base1Edge);
                const edge2 = toEdge(pair.base2Edge);
                const bp: BasePairsTypes.BasePair = {
                    kind: 'pair',
                    PDB_model_number: pair.model,
                    orientation: orient,
                    is_coding: isCoding(pair.compId1, pair.compId2, orient, edge1, edge2),
                    napascoMetric: pair.napascoMetric,
                    napairRmsd: pair.napairRmsd,
                    a: {
                        asym_id: pair.asymId1, entity_id: asymToEntity.get(pair.asymId1) ?? '',
                        seq_id: pair.seqId1, auth_seq_id: pair.authSeqId1,
                        comp_id: pair.compId1, PDB_ins_code: pair.insCode1,
                        alt_id: pair.altId1, struct_oper_id: '1',
                        base_edge: edge1,
                    },
                    b: {
                        asym_id: pair.asymId2, entity_id: asymToEntity.get(pair.asymId2) ?? '',
                        seq_id: pair.seqId2, auth_seq_id: pair.authSeqId2,
                        comp_id: pair.compId2, PDB_ins_code: pair.insCode2,
                        alt_id: pair.altId2, struct_oper_id: '1',
                        base_edge: edge2,
                    },
                };
                items.push(bp);
                addToMapping(pair.model, pair.asymId1, pair.seqId1);
            }

            for (const ur of payload.unpaired) {
                const u: BasePairsTypes.UnpairedResidue = {
                    kind: 'unpaired',
                    PDB_model_number: ur.model,
                    residue: {
                        asym_id: ur.asymId, entity_id: asymToEntity.get(ur.asymId) ?? '',
                        seq_id: ur.seqId, auth_seq_id: ur.authSeqId,
                        comp_id: ur.compId, PDB_ins_code: ur.insCode,
                    },
                };
                items.push(u);
                addToMapping(ur.model, ur.asymId, ur.seqId);
            }

            setExternalPairings({ items, mapping });
        }

        // Invalidate the cached model property so fromCif re-evaluates
        const modelObj = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef))?.obj;
        if (modelObj) {
            delete (modelObj as any).data._staticPropertyData['base-pairs-ladder'];
        }

        // Force re-draw: remove the ladder and re-add it if currently visible
        if (this.has('base-pairs-ladder', 'nucleic')) {
            await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('base-pairs-ladder', 'nucleic', BaseRef) });
            if (display.structures.showBasePairsLadder) {
                await this.changeBasePairsLadder(display);
            }
        }
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

        // Apply transparency to NtC tube when residues are selected
        const hasSelections = this.selections.length > 0;

        if (this.has('visual', sub)) {
            b.to(IDs.ID('visual', sub, BaseRef))
                .update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    old => ({
                        ...old,
                        ...this.substructureVisuals(vis, hasSelections),
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
                            ...this.substructureVisuals(vis, hasSelections),
                        })
                    );
            }

            // Automatically show pyramids when nucleic representation is set to cartoon
            if (display.structures.nucleicRepresentation === 'cartoon') {
                if (!display.structures.showPyramids) {
                    display.structures.showPyramids = true;
                }
            }
        }

        await b.commit();

        // Update pyramids if nucleic representation changed to cartoon
        if (sub === 'nucleic' && display.structures.nucleicRepresentation === 'cartoon') {
            await this.changePyramids(display);
        }
    }

    async toggleSurroundingResidues(display: Display) {
        // Update custom surroundings based on current focus
        const currentFocus = this.plugin.managers.structure.focus.current;
        const loci = currentFocus?.loci;

        await this.updateCustomSurroundings(loci, display);
    }

    async updateCustomSurroundings(loci: StructureElement.Loci | undefined, display: Display) {
        const enabled = display.structures.showSurroundingResidues;
        const radius = display.structures.surroundingResiduesDistance;

        // Remove existing custom surroundings if any
        if (this.customSurroundingsRef) {
            const existingNode = this.plugin.state.data.select(this.customSurroundingsRef)[0];
            if (existingNode) {
                await this.plugin.state.data.build().delete(this.customSurroundingsRef).commit();
            }
            this.customSurroundingsRef = undefined;
        }

        // If disabled or no loci, we're done
        if (!enabled || !loci || StructureElement.Loci.isEmpty(loci)) {
            return;
        }

        // Find the structure node
        const structure = loci.structure;

        // Try to find the structure cell - first try exact match
        let structureCell: StateObjectCell | undefined = this.plugin.state.data.selectQ(q =>
            q.ofType(PluginStateObject.Molecule.Structure).filter(c => c.obj?.data === structure)
        )[0];

        // If not found, try to find the parent structure
        if (!structureCell) {
            const parentNode = this.plugin.helpers.substructureParent.get(structure);
            if (parentNode) {
                structureCell = this.plugin.state.data.cells.get(parentNode.transform.ref) as StateObjectCell | undefined;
            }
        }

        // If still not found, try to use the entire structure as fallback (not nucleic-only)
        // This ensures surroundings can include ligands, waters, ions, etc.
        if (!structureCell) {
            structureCell = this.plugin.state.data.cells.get(IDs.ID('entire-structure', '', BaseRef)) as StateObjectCell | undefined;
        }

        if (!structureCell) {
            console.warn('Could not find structure cell for custom surroundings');
            return;
        }

        // Build expression for surroundings around all residues in the loci
        // We manually build expressions because Bundle.toExpression has a bug
        // where it loses residues in multi-residue loci

        // Build expressions for each residue and combine them
        const residueExpressions: any[] = [];

        for (const element of loci.elements) {
            const unit = element.unit;
            const size = OrderedSet.size(element.indices);
            const processedResidues = new Set<number>();

            for (let i = 0; i < size; i++) {
                const atomIdx = OrderedSet.getAt(element.indices, i);
                const residueIdx = unit.model.atomicHierarchy.residueAtomSegments.index[atomIdx];

                if (processedResidues.has(residueIdx)) continue;
                processedResidues.add(residueIdx);

                // Get residue auth info for the expression
                const loc = Location.create(structure, unit, unit.elements[atomIdx]);
                const authSeqId = StructureProperties.residue.auth_seq_id(loc);
                const authAsymId = StructureProperties.chain.auth_asym_id(loc);
                const insCode = StructureProperties.residue.pdbx_PDB_ins_code(loc);

                // Create expression for this specific residue
                let residueExpr = MSB.struct.generator.atomGroups({
                    'chain-test': MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_asym_id(), authAsymId]),
                    'residue-test': MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_seq_id(), authSeqId])
                });

                if (insCode) {
                    residueExpr = MSB.struct.modifier.intersectBy({
                        0: residueExpr,
                        by: MSB.struct.generator.atomGroups({
                            'residue-test': MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.pdbx_PDB_ins_code(), insCode])
                        })
                    });
                }

                residueExpressions.push(residueExpr);
            }
        }

        // Combine all residue expressions with union
        let targetExpression = residueExpressions[0];
        for (let i = 1; i < residueExpressions.length; i++) {
            targetExpression = MSB.struct.combinator.merge([targetExpression, residueExpressions[i]]);
        }

        const surroundingsExpression = MSB.struct.modifier.includeSurroundings({
            0: targetExpression,
            radius: radius,
            'as-whole-residues': true
        });

        // Exclude the target residues from the surroundings
        const surroundingsOnlyExpression = MSB.struct.modifier.exceptBy({
            0: surroundingsExpression,
            by: targetExpression
        });

        // Create the selection and representation
        const update = this.plugin.state.data.build();
        const selection = update.to(structureCell.transform.ref)
            .apply(StateTransforms.Model.StructureSelectionFromExpression, {
                expression: surroundingsOnlyExpression,
                label: 'Custom Surroundings'
            }, { tags: 'custom-surroundings-selection' });

        const repr = selection
            .apply(StateTransforms.Representation.StructureRepresentation3D, {
                type: {
                    name: 'ball-and-stick',
                    params: {
                        sizeFactor: 0.1,
                        sizeAspectRatio: 0.33,
                        aromaticBonds: false,
                        excludeTypes: ['hydrogen-bond', 'metal-coordination']
                    }
                },
                colorTheme: { name: 'element-symbol', params: {} }
            }, { tags: 'custom-surroundings-repr' });

        await update.commit();
        this.customSurroundingsRef = repr.ref;
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

    focusOnSelection(selectionsToFocusOn: Api.Payloads.StructureSelection[]) {
        const locis = [];

        for (const sel of selectionsToFocusOn) {
            const selObj = this.selections.find((obj) => {
                if (sel.type !== obj.selector.type)
                    return false;

                if (obj.selector.type === 'step' && (sel as Api.Payloads.StepSelection).name === obj.selector.name)
                    return true;
                else if (obj.selector.type === 'residue' && residuesEqual((sel as Api.Payloads.ResidueSelection), obj.selector))
                    return true;
                else if (obj.selector.type === 'base-pair' && basePairsEqual((sel as Api.Payloads.BasePairSelection), obj.selector))
                    return true;
                return false;
            });

            if (selObj) {
                for (const obj of selObj.objects) {
                    if (obj.params.kind === 'structure' && obj.primary)
                        locis.push(Structure.toStructureElementLoci(this.plugin.state.data.cells.get(obj.id)!.obj!.data));
                }
            }
        }

        if (locis.length > 0)
            this.focusOnLocis(locis);
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

    getAvailableAssemblies(): Api.AssemblyInfo[] {
        return this.availableAssemblies;
    }

    getActiveAssemblies(): string[] {
        return this.activeAssemblies;
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

    private extractAssemblyInfo(model: Model) {
        this.availableAssemblies = [];

        // Extract assemblies from model symmetry custom property
        const symmetry = ModelSymmetry.Provider.get(model);

        if (symmetry && symmetry.assemblies) {
            // Add assemblies that have real symmetry operations
            for (const assembly of symmetry.assemblies) {
                const hasRealSymmetry = this.assemblyHasRealSymmetry(assembly);

                if (hasRealSymmetry) {
                    this.availableAssemblies.push({
                        id: assembly.id,
                        name: `Assembly ${assembly.id}`,
                        details: assembly.details || undefined
                    });
                }
            }
        }

        // Only add asymmetric unit if there are NO assemblies
        if (this.availableAssemblies.length === 0) {
            this.availableAssemblies.push({
                id: 'asymmetric-unit',
                name: 'Asymmetric Unit',
                details: 'The asymmetric unit of the crystal structure'
            });
        }
    }

    private assemblyHasRealSymmetry(assembly: { operatorGroups: ReadonlyArray<{ operators: ReadonlyArray<SymmetryOperator> }> }): boolean {
        try {
            const groups = assembly.operatorGroups;

            // If there are no operator groups, it's identity-only
            if (!groups || groups.length === 0) return false;

            // Check if any group has more than one operator, or if the single operator is not identity
            for (const group of groups) {
                if (!group.operators || group.operators.length === 0) continue;

                // More than one operator means real symmetry
                if (group.operators.length > 1) return true;

                // Check if the single operator is not identity
                // Identity operator has name '1_555' or similar
                const op = group.operators[0];
                if (op.name !== '1_555' && !op.name.startsWith('1_555')) {
                    return true;
                }
            }

            return false;
        } catch {
            // If there's any error accessing operator groups, assume it has symmetry
            return true;
        }
    }

    async switchAssemblies(assemblyIds: string[], display: Display) {
        // For now, support only single assembly selection
        // Multi-assembly visualization would require parallel state tree branches
        if (assemblyIds.length === 0) return;

        const assemblyId = assemblyIds[0];
        this.activeAssemblies = [assemblyId];

        // Get the model
        const modelCell = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef));
        if (!modelCell?.obj) return;

        // Remove old structure and its children
        const update = this.plugin.state.data.build();
        if (this.has('entire-structure', '', BaseRef)) {
            update.delete(IDs.ID('entire-structure', '', BaseRef));
        }
        await update.commit();

        // Build new structure with selected assembly
        const assemblyParams = assemblyId === 'asymmetric-unit'
            ? { type: { name: 'model' as const, params: {} } }
            : { type: { name: 'assembly' as const, params: assemblyId ? { id: assemblyId } : {} } };

        const b = this.plugin.state.data.build()
            .to(IDs.ID('model', '', BaseRef))
            .apply(StateTransforms.Model.StructureFromModel, assemblyParams, { ref: IDs.ID('entire-structure', '', BaseRef) })
            // Extract substructures
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'nucleic' }, { ref: IDs.ID('entire-structure', 'nucleic', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'protein' }, { ref: IDs.ID('entire-structure', 'protein', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { ref: IDs.ID('entire-structure', 'water', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'non-water-small-molecules' }, { ref: IDs.ID('entire-structure', 'ligand', BaseRef) });
        await b.commit();

        // Rebuild filtered structures
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
        if (this.has('entire-structure', 'ligand')) {
            b2.to(IDs.ID('entire-structure', 'ligand', BaseRef))
                .apply(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: Filtering.toExpression(Filters.Empty()) },
                    { ref: IDs.ID('structure', 'ligand', BaseRef) }
                );
        }
        await b2.commit();

        // Recreate visuals with current display settings
        const chainColor = Color(display.structures.chainColor);
        const waterColor = Color(display.structures.waterColor);

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
        if (display.structures.showLigand && this.has('structure', 'ligand')) {
            b3.to(IDs.ID('structure', 'ligand', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.ligandVisuals(),
                    { ref: IDs.ID('visual', 'ligand', BaseRef) }
                );
        }

        if (display.structures.showPyramids) {
            b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.pyramidsParams(display.structures.conformerColors ?? NtCColors.Conformers, new Map(), display.structures.pyramidsTransparent ?? false),
                    { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                );
        }

        if (this.areBasePairsAvailable() && display.structures.showBasePairsLadder) {
            b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.basePairsLadderParams(display),
                    { ref: IDs.ID('base-pairs-ladder', 'nucleic', BaseRef) }
                );
        }

        await b3.commit();

        // Clear selections as they may no longer be valid
        this.selections.splice(0, this.selections.length);
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
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: modelNumber - 1 }, { ref: IDs.ID('model', '', BaseRef) }); // WARNING: The modelNumber - 1 is a major hack!!!
        await b.commit();

        // Extract available assemblies from the model
        const modelCell = this.plugin.state.data.cells.get(IDs.ID('model', '', BaseRef));
        if (modelCell?.obj) {
            const model = (modelCell.obj as StateObject<Model>).data;
            this.extractAssemblyInfo(model);
        }

        // Determine which assembly to use
        let assemblyId = display.structures.activeAssemblies.length > 0 && display.structures.activeAssemblies[0]
            ? display.structures.activeAssemblies[0]
            : '';

        // If no specific assembly is requested (empty string), use the first available assembly
        if (!assemblyId || assemblyId === '') {
            assemblyId = this.availableAssemblies.length > 0 ? this.availableAssemblies[0].id : 'asymmetric-unit';
        }

        this.activeAssemblies = [assemblyId];

        // Use the selected assembly
        const assemblyParams = assemblyId === 'asymmetric-unit'
            ? { type: { name: 'model' as const, params: {} } }
            : { type: { name: 'assembly' as const, params: { id: assemblyId } } };

        const b1_5 = this.plugin.state.data.build()
            .to(IDs.ID('model', '', BaseRef))
            .apply(StateTransforms.Model.StructureFromModel, assemblyParams, { ref: IDs.ID('entire-structure', '', BaseRef) })
            // Extract substructures
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'nucleic' }, { ref: IDs.ID('entire-structure', 'nucleic', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'protein' }, { ref: IDs.ID('entire-structure', 'protein', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { ref: IDs.ID('entire-structure', 'water', BaseRef) })
            .to(IDs.ID('entire-structure', '', BaseRef))
            .apply(StateTransforms.Model.StructureComplexElement, { type: 'non-water-small-molecules' }, { ref: IDs.ID('entire-structure', 'ligand', BaseRef) });
        // Commit now so that we can check whether individual substructures are available and apply filters
        await b1_5.commit();

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
        if (this.has('entire-structure', 'ligand')) {
            b2.to(IDs.ID('entire-structure', 'ligand', BaseRef))
                .apply(
                    StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: Filtering.toExpression(Filters.Empty()) },
                    { ref: IDs.ID('structure', 'ligand', BaseRef) }
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
        if (display.structures.showLigand && this.has('structure', 'ligand')) {
            b3.to(IDs.ID('structure', 'ligand', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.ligandVisuals(),
                    { ref: IDs.ID('visual', 'ligand', BaseRef) }
                );
        }

        if (display.structures.showPyramids) {
            b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.pyramidsParams(display.structures.conformerColors ?? NtCColors.Conformers, new Map(), display.structures.pyramidsTransparent ?? false),
                    { ref: IDs.ID('pyramids', 'nucleic', BaseRef) }
                );
        }

        if (this.areBasePairsAvailable() && display.structures.showBasePairsLadder) {
            b3.to(IDs.ID('structure', 'nucleic', BaseRef))
                .apply(
                    StateTransforms.Representation.StructureRepresentation3D,
                    this.basePairsLadderParams(display),
                    { ref: IDs.ID('base-pairs-ladder', 'nucleic', BaseRef) }
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

    notifyResidueSelected(desc: Residue.Description) {
        this.app.viewerResidueSelected(desc);
    }

    async notifyStructureDeselected() {
        // Clear focus to hide surrounding residues
        this.plugin.managers.structure.focus.clear();

        // Clear custom surroundings
        await this.updateCustomSurroundings(undefined, this.app.state.display);

        if (this.selections.length === 0)
            this.resetCamera();
        else
            this.app.viewerStructureDeselected();
    }

    notifyStepSelected(name: string) {
        this.app.viewerStepSelected(name);
    }

    notifyBasePairSelected(basePair: BasePairsTypes.BasePair) {
        // Get the structure to extract auth_seq_id values
        const stru = this.plugin.state.data.cells.get(IDs.ID('entire-structure', 'nucleic', BaseRef));
        if (!stru?.obj?.data) {
            console.warn('[Viewer.notifyBasePairSelected] No structure available');
            return;
        }

        const struLoci = Structure.toStructureElementLoci(stru.obj.data);

        // Find the residues to get their auth_seq_id
        const residue1Loci = Search.findResidue(
            basePair.a.asym_id,
            basePair.a.seq_id,
            basePair.a.alt_id,
            basePair.a.PDB_ins_code,
            struLoci,
            'label'
        );

        const residue2Loci = Search.findResidue(
            basePair.b.asym_id,
            basePair.b.seq_id,
            basePair.b.alt_id,
            basePair.b.PDB_ins_code,
            struLoci,
            'label'
        );

        if (residue1Loci.kind === 'element-loci' && residue2Loci.kind === 'element-loci') {
            // Extract auth_seq_id from the loci
            const loc1 = StructureElement.Location.create(residue1Loci.structure);
            loc1.unit = residue1Loci.elements[0].unit;
            loc1.element = residue1Loci.elements[0].unit.elements[OrderedSet.getAt(residue1Loci.elements[0].indices, 0)];
            const authSeqId1 = StructureProperties.residue.auth_seq_id(loc1);

            const loc2 = StructureElement.Location.create(residue2Loci.structure);
            loc2.unit = residue2Loci.elements[0].unit;
            loc2.element = residue2Loci.elements[0].unit.elements[OrderedSet.getAt(residue2Loci.elements[0].indices, 0)];
            const authSeqId2 = StructureProperties.residue.auth_seq_id(loc2);

            // Now create an enriched base pair object with auth_seq_id fields
            const enrichedBasePair = {
                ...basePair,
                auth_seq_id_1: authSeqId1,
                auth_seq_id_2: authSeqId2
            };

            this.app.viewerBasePairSelected(enrichedBasePair);
        }
    }

    async onLociSelected(selected: Representation.Loci) {
        const granularity = this.plugin.managers.interactivity.props.granularity;

        // For residue selections, deselect all previous selections first (single selection mode)
        if (granularity === 'residue') {
            await this.notifyStructureDeselected();
        }

        const normalized = (() => {
            if (selected.loci.kind === 'data-loci') {
                if (selected.loci.tag === 'dnatco-tube-segment-data') {
                    const stru = this.plugin.state.data.cells.get(IDs.ID('entire-structure', 'nucleic', BaseRef));
                    if (stru) {
                        const tubeLoci = selected.loci as NtCTubeTypes.Loci;

                        // We need to the MOD because the element index we get from Molstar may point
                        // to a symmetry copy. There does not seem to be any good way how to detect this.
                        const elemIdx = tubeLoci.elements[0] % (tubeLoci.data.length * 4);
                        const stepIdx = elemIdx / 4; // There are 4 tube segments per step
                        const step = tubeLoci.data[stepIdx];
                        if (step)
                            return ntcStepToElementLoci(step, stru.obj!.data);
                        else
                            return EmptyLoci;
                    }
                    return EmptyLoci;
                } else if (selected.loci.tag === 'base-pairs-base-in-pair') {
                    // Base pair ladder clicked
                    const stru = this.plugin.state.data.cells.get(IDs.ID('entire-structure', 'nucleic', BaseRef));
                    if (stru) {
                        const bpLoci = selected.loci as BasePairsLadderTypes.Loci;
                        // bpLoci.data contains only the selected items, so use index 0
                        const item = bpLoci.data[0];

                        if (item && item.kind === 'pair') {
                            // Convert base pair to element loci for both residues
                            const residue1Loci = Search.findResidue(
                                item.a.asym_id,
                                item.a.seq_id,
                                item.a.alt_id,
                                item.a.PDB_ins_code,
                                Structure.toStructureElementLoci(stru.obj!.data),
                                'label'
                            );
                            const residue2Loci = Search.findResidue(
                                item.b.asym_id,
                                item.b.seq_id,
                                item.b.alt_id,
                                item.b.PDB_ins_code,
                                Structure.toStructureElementLoci(stru.obj!.data),
                                'label'
                            );

                            if (residue1Loci.kind === 'element-loci' && residue2Loci.kind === 'element-loci') {
                                // Store the base pair item for notification
                                this.lastClickedBasePair = item;

                                // Use structureUnion to properly combine the two residues with the parent structure
                                // This is the same approach used in Search.findStep
                                const parentStructure = stru.obj!.data;
                                const union = structureUnion(parentStructure, [
                                    StructureElement.Loci.toStructure(residue1Loci),
                                    StructureElement.Loci.toStructure(residue2Loci)
                                ]);
                                return Structure.toStructureElementLoci(union);
                            }
                        }
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
                // Check if this is a base pair click first
                if (this.lastClickedBasePair) {
                    this.notifyBasePairSelected(this.lastClickedBasePair);
                    this.lastClickedBasePair = undefined;
                } else {
                    // Otherwise check if it's an NtC step
                    const desc = Step.describe(normalized, this.haveMultipleModels);
                    if (desc && this.stepNames.has(desc.name))
                        this.notifyStepSelected(desc.name);
                }
            } else if (granularity === 'residue') {
                const desc = Residue.describe(normalized);
                this.notifyResidueSelected(desc);
            }

            // Update custom surroundings representation (only if enabled)
            if (this.app.state.display.structures.showSurroundingResidues) {
                await this.updateCustomSurroundings(normalized, this.app.state.display);
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

        if (this.has('structure', 'ligand', BaseRef)) {
            b.to(IDs.ID('structure', 'ligand', BaseRef))
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

        // Clear custom surroundings when deselecting
        await this.updateCustomSurroundings(undefined, display);

        const struLoci = this.getNucleicStructure();
        if (struLoci)
            await this.visualizeNucleic(true, struLoci, display);
    }

    async actionHighlight(highlights: (Api.Payloads.AtomSelection | Api.Payloads.ResidueSelection)[]) {
        const struLoci = this.getNucleicStructure();
        if (!struLoci)
            return;

        let toHighlight;
        for (const hl of highlights) {
            const loci = hl.type === 'atom'
                ? Search.findAtom(hl.chain, hl.seqId, hl.altId, hl.insCode, hl.cifAtomId, struLoci, 'auth')
                : hl.type === 'residue'
                    ? Search.findResidue(hl.chain, hl.seqId, hl.altId, hl.insCode, struLoci, 'auth')
                    : EmptyLoci;
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
        if (!struLoci) {
            console.warn('There are no nucleic acids in the structure');
            return [];
        }

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
            } else if (sel.type === 'base-pair') {
                m = sel.basePair.modelNum;
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

                    // Expect that the "stepFromName" check ensures that the step is present in the structure
                    selectionExtended = this.addSelection(StruSelection(sel.step)) || selectionExtended;
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
            } else if (sel.type === 'base-pair') {
                const basePair = sel.basePair;

                // Check that both residues exist
                const residue1Loci = Search.findResidue(basePair.asymId1, basePair.seqId1, basePair.altId1, basePair.insCode1, struLoci, 'label');
                const residue2Loci = Search.findResidue(basePair.asymId2, basePair.seqId2, basePair.altId2, basePair.insCode2, struLoci, 'label');

                if (residue1Loci.kind === 'element-loci' && residue2Loci.kind === 'element-loci') {
                    selectionExtended = this.addSelection(StruSelection(basePair)) || selectionExtended;
                    succeeded.push(basePair);
                }
            }
        }

        await this.visualizeNucleic(selectionExtended, struLoci, display);

        // Update custom surroundings for the selections (only if enabled)
        if (this.app.state.display.structures.showSurroundingResidues && succeeded.length > 0) {
            // Get the first selection (when clicking residue table, first is the residue, rest are bonded atoms)
            const firstSel = selections[0];
            let loci: Loci = EmptyLoci;

            if (firstSel.type === 'step') {
                const stepLociArray = this.stepLoci(firstSel.step.name, struLoci);
                if (stepLociArray.length > 0) {
                    loci = stepLociArray[0];
                }
            } else if (firstSel.type === 'residue') {
                loci = Search.findResidue(
                    firstSel.residue.chain,
                    firstSel.residue.seqId,
                    firstSel.residue.altId,
                    firstSel.residue.insCode,
                    struLoci,
                    'auth'
                );
            } else if (firstSel.type === 'atom') {
                // AtomSelection also has chain (auth_asym_id) and seqId (auth_seq_id)
                loci = Search.findResidue(
                    firstSel.atom.chain,
                    firstSel.atom.seqId,
                    firstSel.atom.altId,
                    firstSel.atom.insCode,
                    struLoci,
                    'auth'
                );
            } else if (firstSel.type === 'base-pair') {
                const residue1Loci = Search.findResidue(
                    firstSel.basePair.asymId1,
                    firstSel.basePair.seqId1,
                    firstSel.basePair.altId1,
                    firstSel.basePair.insCode1,
                    struLoci,
                    'label'
                );
                const residue2Loci = Search.findResidue(
                    firstSel.basePair.asymId2,
                    firstSel.basePair.seqId2,
                    firstSel.basePair.altId2,
                    firstSel.basePair.insCode2,
                    struLoci,
                    'label'
                );

                if (residue1Loci.kind === 'element-loci' && residue2Loci.kind === 'element-loci') {
                    const stru = this.plugin.state.data.cells.get(IDs.ID('entire-structure', 'nucleic', BaseRef));
                    if (stru) {
                        const parentStructure = stru.obj!.data;
                        const union = structureUnion(parentStructure, [
                            StructureElement.Loci.toStructure(residue1Loci),
                            StructureElement.Loci.toStructure(residue2Loci)
                        ]);
                        loci = Structure.toStructureElementLoci(union);
                    }
                }
            }

            if (loci.kind === 'element-loci') {
                await this.updateCustomSurroundings(loci, display);
            }
        }

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
                this.resetCamera();
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
                this.resetCamera();
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
        } else if (sub === 'ligand') {
            if (!display.structures.showLigand) {
                await PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: IDs.ID('visual', sub, BaseRef) });
                this.resetCamera();
            } else {
                const b = this.getBuilder('structure', sub);
                if (b) {
                    b.apply(
                        StateTransforms.Representation.StructureRepresentation3D,
                        this.ligandVisuals(),
                        { ref: IDs.ID('visual', sub, BaseRef) }
                    );
                    await b.commit();
                }
            }
        }
    }
}
