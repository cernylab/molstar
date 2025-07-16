import { BasePairsLadderProvider } from './property';
import { BasePairsUtil } from '../util';
import { BasePairs } from '../property';
import { BasePairsTypes } from '../types';
import { Interval, Segmentation } from '../../../mol-data/int';
import { Mesh } from '../../../mol-geo/geometry/mesh/mesh';
import { PickingId } from '../../../mol-geo/geometry/picking';
import { EmptyLocationIterator, LocationIterator } from '../../../mol-geo/util/location-iterator';
import { EmptyLoci, Loci } from '../../../mol-model/loci';
import { NullLocation } from '../../../mol-model/location';
import { ElementIndex, Structure, StructureElement, StructureProperties, Unit } from '../../../mol-model/structure';
import { CustomProperty } from '../../../mol-model-props/common/custom-property';
import { Representation, RepresentationContext, RepresentationParamsGetter } from '../../../mol-repr/representation';
import { StructureRepresentation, StructureRepresentationProvider, StructureRepresentationStateBuilder, UnitsRepresentation } from '../../../mol-repr/structure/representation';
import { StructureGroup } from '../../../mol-repr/structure/visual/util/common';
import { VisualUpdateState } from '../../../mol-repr/util';
import { VisualContext } from '../../../mol-repr/visual';
import { UnitsMeshParams, UnitsMeshVisual, UnitsVisual } from '../../../mol-repr/structure/units-visual';
import { Theme } from '../../../mol-theme/theme';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { MeshBuilder } from '../../../mol-geo/geometry/mesh/mesh-builder';
import { getNucleotideBaseType } from '../../../mol-repr/structure/visual/util/nucleotide';
import { Vec3 } from '../../../mol-math/linear-algebra';
import { addCylinder } from '../../../mol-geo/geometry/mesh/builder/cylinder';
import { BasePairsLadderTypes } from './types';
import { addSphere } from '../../../mol-geo/geometry/mesh/builder/sphere';

const BasePairsLadderMeshParams = {
    ...UnitsMeshParams,
    barRadius: PD.Numeric(0.5, { min: 0.1, max: 5.0, step: 0.1 }),
    barScale: PD.Numeric(1.0, { min: 0.1, max: 2.0, step: 0.1 }),
    ballRadius: PD.Numeric(1.3, { min: 0.1, max: 5.0, step: 0.1 }),
    showPairs: PD.Boolean(true),
    showUnpaired: PD.Boolean(true),
};
type BasePairsLadderMeshParams = typeof BasePairsLadderMeshParams;

function calcMidpoint(mp: Vec3, v: Vec3, w: Vec3) {
    Vec3.sub(mp, v, w);
    Vec3.scale(mp, mp, 0.5);
    Vec3.add(mp, mp, w);
}

function findAtomInRange(name: string, altId: string, start: number, end: number, structure: Structure, unit: Unit) {
    const loc = StructureElement.Location.create(structure, unit, -1 as ElementIndex);

    for (let eI = start; eI < end; eI++) {
        loc.element = loc.unit.elements[eI];
        const elName = StructureProperties.atom.label_atom_id(loc);
        const elAltId = StructureProperties.atom.label_alt_id(loc);

        if (elName === name && elAltId === altId) return loc.element;
    }

    return -1 as ElementIndex;
}

function findResidue(operId: string, asymId: string, seqId: number, insCode: string, structure: Structure) {
    for (const symGroup of structure.unitSymmetryGroups) {
        for (const unit of symGroup.units) {
            if (!Unit.isAtomic(unit)) continue;
            if (!unit.conformation.operator.assembly?.operList.includes(operId)) {
                continue;
            }

            const r = findResidueInUnit(asymId, seqId, insCode, structure, unit);
            if (r) return r;
        }
    }

    return void 0;
}

function findResidueInUnit(asymId: string, seqId: number, insCode: string, structure: Structure, unit: Unit.Atomic) {
    const loc = StructureElement.Location.create(structure, unit, -1 as ElementIndex);

    const chainIt = Segmentation.transientSegments(structure.model.atomicHierarchy.chainAtomSegments, unit.elements);
    const residueIt = Segmentation.transientSegments(structure.model.atomicHierarchy.residueAtomSegments, unit.elements);

    while (chainIt.hasNext) {
        residueIt.setSegment(chainIt.move());
        while (residueIt.hasNext) {
            const residue = residueIt.move();

            loc.element = loc.unit.elements[residue.start];

            const rAsymId = StructureProperties.chain.label_asym_id(loc);
            if (rAsymId !== asymId) break;

            const rSeqId = StructureProperties.residue.label_seq_id(loc);
            const rInsCode = StructureProperties.residue.pdbx_PDB_ins_code(loc);
            if (rSeqId === seqId && rInsCode === insCode) return { residue, unit };
        }
    }

    return void 0;
}

const EmptyItemIndices = new Array<number>();
function findItemIndices(mapping: BasePairsTypes.AsymIdMap[], modelIdx: number, asym_id: string, seq_id: number) {
    const asymIdMap = mapping[modelIdx];
    if (!asymIdMap) return EmptyItemIndices;

    const seqIdMap = asymIdMap.get(asym_id);
    if (!seqIdMap) return EmptyItemIndices;

    return seqIdMap.get(seq_id) ?? EmptyItemIndices;
}

function isBasePairMatching(
    item: BasePairsTypes.BasePair,
    unit: Unit.Atomic,
    currentResidue: BasePairsTypes.Residue
) {
    return (
        unit.conformation.operator.assembly?.operList.includes(item.a.struct_oper_id) &&
        BasePairsUtil.areResiduesMatching(item.a, currentResidue)
    );
}

function isUsableBaseType(bt: { isPurine: boolean, isPyrimidine: boolean }) {
    return bt.isPurine !== bt.isPyrimidine;
}

const firstAnchorPos = Vec3();
const secondAnchorPos = Vec3();
const midpoint = Vec3();

function getAnchorAtoms(first: BasePairsTypes.PairedBase, second: BasePairsTypes.PairedBase, structure: Structure, unit: Unit.Atomic) {
    const firstResidue = findResidueInUnit(first.asym_id, first.seq_id, first.PDB_ins_code, structure, unit);
    if (!firstResidue) {
        return void 0;
    }
    const secondResidue = findResidue(second.struct_oper_id, second.asym_id, second.seq_id, second.PDB_ins_code, structure);
    if (!secondResidue) {
        return void 0;
    }

    const firstBaseType = getNucleotideBaseType(firstResidue.unit, firstResidue.residue.index);
    const secondBaseType = getNucleotideBaseType(secondResidue.unit, secondResidue.residue.index);
    if (!isUsableBaseType(firstBaseType) || !isUsableBaseType(secondBaseType)) return void 0;

    const firstAnchorAtomName = firstBaseType.isPyrimidine ? 'N1' : 'N9';
    const secondAnchorAtomName = secondBaseType.isPyrimidine ? 'N1' : 'N9';

    const firstAtom = findAtomInRange(firstAnchorAtomName, first.alt_id, firstResidue.residue.start, firstResidue.residue.end, structure, firstResidue.unit);
    const secondAtom = findAtomInRange(secondAnchorAtomName, second.alt_id, secondResidue.residue.start, secondResidue.residue.end, structure, secondResidue.unit);

    if (firstAtom === -1 || secondAtom === -1) return void 0;

    firstResidue.unit.conformation.position(firstAtom, firstAnchorPos);
    secondResidue.unit.conformation.position(secondAtom, secondAnchorPos);

    return {
        firstAtom: firstAnchorPos,
        secondAtom: secondAnchorPos,
    };
}

function createBasePairsLadderIterator(structureGroup: StructureGroup): LocationIterator {
    const { structure, group } = structureGroup;
    const instanceCount = group.units.length;

    const data = BasePairsLadderProvider.get(structure.model)?.value?.data;
    if (!data) return EmptyLocationIterator;

    const no = 3 * data.items.length;

    const getLocation = (groupIndex: number) => {
        const item = data.items[Math.floor(groupIndex / 3)];
        if (!item) return NullLocation;

        if (item.kind === 'unpaired') {
            return BasePairsLadderTypes.Location({ kind: 'unpaired' });
        } else {
            const part = groupIndex % 3;
            if (part === 0) {
                return BasePairsLadderTypes.Location({ kind: 'base', base: item.a, pair: item });
            } else if (part === 1) {
                return BasePairsLadderTypes.Location({ kind: 'base', base: item.b, pair: item });
            } else {
                return BasePairsLadderTypes.Location({ kind: 'ball', pair: item });
            }
        }
    };

    return LocationIterator(no, instanceCount, 1, getLocation);
}

function createBasePairsLadderMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PD.Values<BasePairsLadderMeshParams>, mesh?: Mesh) {
    if (!Unit.isAtomic(unit)) return Mesh.createEmpty(mesh);

    const data = BasePairsLadderProvider.get(structure.model)?.value?.data;
    if (!data) return Mesh.createEmpty(mesh);

    const { items, mapping } = data;

    const cylinderProps = { topCap: true, bottomCap: true, radiusTop: props.barRadius, radiusBottom: props.barRadius, radialSegments: 8 };
    // This estimate is completely wrong but we need to give the builder something
    const mb = MeshBuilder.createState(items.length * 8, items.length * 8 / structure.models.length, mesh);

    const chainIt = Segmentation.transientSegments(structure.model.atomicHierarchy.chainAtomSegments, unit.elements);
    const residueIt = Segmentation.transientSegments(structure.model.atomicHierarchy.residueAtomSegments, unit.elements);

    const loc = StructureElement.Location.create(structure, unit, -1 as ElementIndex);
    while (chainIt.hasNext) {
        residueIt.setSegment(chainIt.move());
        while (residueIt.hasNext) {
            const residue = residueIt.move();

            loc.element = loc.unit.elements[residue.start];
            const asym_id = StructureProperties.chain.label_asym_id(loc);
            const entity_id = StructureProperties.entity.id(loc);
            const seq_id = StructureProperties.residue.label_seq_id(loc);
            const PDB_ins_code = StructureProperties.residue.pdbx_PDB_ins_code(loc);
            const comp_id = StructureProperties.atom.label_comp_id(loc);
            const alt_id = StructureProperties.atom.label_alt_id(loc);

            const current = {
                asym_id, entity_id, seq_id, comp_id, PDB_ins_code
            };

            const itemIndices = findItemIndices(mapping, structure.model.modelNum - 1, asym_id, seq_id);
            for (const itemIdx of itemIndices) {
                const item = items[itemIdx];

                if (item.kind === 'unpaired' && props.showUnpaired) {
                    if (!BasePairsUtil.areResiduesMatching(item.residue, current)) continue;

                    const baseType = getNucleotideBaseType(unit, residue.index);
                    if (isUsableBaseType(baseType)) {
                        const anchorAtomName = baseType.isPyrimidine ? 'N1' : 'N9';
                        const atom = findAtomInRange(anchorAtomName, alt_id, residue.start, residue.end, structure, unit);

                        if (atom !== -1) {
                            unit.conformation.position(atom, midpoint);

                            mb.currentGroup = 3 * itemIdx;
                            addSphere(mb, midpoint, props.ballRadius, 4);

                            break;
                        }
                    }
                } else if (item.kind === 'pair' && props.showPairs) {
                    const matching = isBasePairMatching(item, unit, current);
                    if (matching) {
                        const anchors = getAnchorAtoms(item.a, item.b, structure, unit);
                        if (!anchors) {
                            continue;
                        }
                        const { firstAtom, secondAtom } = anchors;

                        calcMidpoint(midpoint, firstAtom, secondAtom);

                        mb.currentGroup = 3 * itemIdx;
                        addCylinder(mb, midpoint, firstAtom, props.barScale, cylinderProps);
                        mb.currentGroup = 3 * itemIdx + 1;
                        addCylinder(mb, midpoint, secondAtom, props.barScale, cylinderProps);
                        mb.currentGroup = 3 * itemIdx + 2;
                        addSphere(mb, midpoint, props.ballRadius, 4);
                    }
                }
            }
        }
    }

    return MeshBuilder.getMesh(mb);
}

function findOpposingUnit(oper_id: string, refItem: BasePairsTypes.BasePair, data: BasePairsTypes.Data, units: readonly Unit[]) {
    // First we need to find a base pair where the base "a" is from the "current" unit. We identify the current
    // unit by its symmetry operator ID

    const { items, mapping } = data;
    const itemIndices = findItemIndices(mapping, refItem.PDB_model_number - 1, refItem.a.asym_id, refItem.a.seq_id);

    let item;
    for (const itemIdx of itemIndices) {
        const _item = items[itemIdx];
        if (_item.kind !== 'pair') continue;

        if (BasePairsUtil.areResiduesMatching(refItem.a, _item.a) && _item.a.struct_oper_id === oper_id) {
            item = _item;
            break;
        }
    }
    if (!item) return void 0;

    // Now find the opposing unit based on the symmetry operator ID of the base "b"
    return units.find(u => u.conformation.operator.assembly?.operList.includes(item.b.struct_oper_id));
}

function getBasePairsLadderLoci(pickingId: PickingId, structureGroup: StructureGroup, id: number) {
    const { groupId, objectId, instanceId } = pickingId;
    if (objectId !== id) return EmptyLoci;

    const { structure } = structureGroup;

    const unit = structureGroup.group.units[instanceId];
    if (!Unit.isAtomic(unit)) return EmptyLoci;

    const data = BasePairsLadderProvider.get(structure.model)?.value?.data;
    if (!data) return EmptyLoci;

    const meshGroupsCount = 3 * data.items.length;

    if (groupId > meshGroupsCount) return EmptyLoci;

    const itemIdx = Math.floor(groupId / 3);
    const offsetGroupId = itemIdx * 3 + meshGroupsCount * instanceId;

    const item = data.items[itemIdx];
    if (item.kind === 'unpaired') {
        const lociItem = { ...item, instanceName: unit.conformation.operator.name };
        return BasePairsLadderTypes.Loci([lociItem], [0], [offsetGroupId]);
    } else {
        const opposingUnit = structureGroup.group.units.length === 1
            ? unit
            : findOpposingUnit(unit.conformation.operator.assembly?.operList[0] ?? '', item, data, structureGroup.group.units);
        if (!opposingUnit) return EmptyLoci;

        const instanceNameA = unit.conformation?.operator.name;
        const instanceNameB = opposingUnit.conformation?.operator.name ?? '?';

        const lociItem = { ...item, instanceNameA, instanceNameB };
        return BasePairsLadderTypes.Loci([lociItem], [0], [offsetGroupId]);
    }
}

function eachBasePairsLadderStep(loci: Loci, structureGroup: StructureGroup, apply: (interval: Interval) => boolean) {
    if (BasePairsLadderTypes.isLoci(loci)) {
        const offsetGroupId = loci.elements[0];
        return apply(Interval.ofBounds(offsetGroupId, offsetGroupId + 3));
    }
    return false;
}

function BasePairsLadderVisual(materialId: number): UnitsVisual<BasePairsLadderMeshParams> {
    return UnitsMeshVisual<BasePairsLadderMeshParams>({
        defaultProps: PD.getDefaultValues(BasePairsLadderMeshParams),
        createGeometry: createBasePairsLadderMesh,
        createLocationIterator: createBasePairsLadderIterator,
        getLoci: getBasePairsLadderLoci,
        eachLocation: eachBasePairsLadderStep,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<BasePairsLadderMeshParams>, currentProps: PD.Values<BasePairsLadderMeshParams>) => {
            state.createGeometry = (
                newProps.quality !== currentProps.quality ||
                newProps.doubleSided !== currentProps.doubleSided ||
                newProps.alpha !== currentProps.alpha ||
                newProps.barRadius !== currentProps.barRadius ||
                newProps.barScale !== currentProps.barScale ||
                newProps.ballRadius !== currentProps.ballRadius ||
                newProps.showPairs !== currentProps.showPairs ||
                newProps.showUnpaired !== currentProps.showUnpaired
            );
        },
        mustRecreate() {
            // Is this too heavy-handed?
            return true;
        },
    }, materialId);
}
const BasePairsLadderVisuals = {
    'base-pairs-ladder-symbol': (ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, BasePairsLadderParams>) => UnitsRepresentation('Base Pairs Ladder Symbol Mesh', ctx, getParams, BasePairsLadderVisual),
} as const;

const BasePairsLadderParams = {
    ...BasePairsLadderMeshParams,
};
type BasePairsLadderParams = typeof BasePairsLadderParams;

export type BasePairsLadderRepresentation = StructureRepresentation<BasePairsLadderParams>;
export function BasePairsLadderRepresentation(ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, BasePairsLadderParams>): BasePairsLadderRepresentation {
    return Representation.createMulti('Base Pairs Ladder', ctx, getParams, StructureRepresentationStateBuilder, BasePairsLadderVisuals);
}
function getBasePairsLadderParams() {
    return PD.clone(BasePairsLadderParams);
}

export const BasePairsLadderRepresentationProvider = StructureRepresentationProvider({
    name: 'base-pairs-ladder',
    label: 'Base Pairs Ladder',
    description: 'Base Pairs geometry in simplified ladder representation',
    factory: BasePairsLadderRepresentation,
    getParams: getBasePairsLadderParams,
    defaultValues: PD.getDefaultValues(BasePairsLadderParams),
    defaultColorTheme: { name: 'base-pairs-ladder' },
    defaultSizeTheme: { name: 'uniform' },
    isApplicable: (structure: Structure) => structure.models.some(m => BasePairs.isApplicable(m)),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, structure: Structure) => BasePairsLadderProvider.attach(ctx, structure.model, void 0, true),
        detach: (data) => BasePairsLadderProvider.ref(data.model, false),
    },
});
