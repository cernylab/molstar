import { BasePairsLadderProvider } from './property';
import { BasePairsUtil } from '../util';
import { BasePairs } from '../property';
import { BasePairsTypes } from '../types';
import { Interval, Segmentation } from '../../../mol-data/int';
import { Mesh } from '../../../mol-geo/geometry/mesh/mesh';
import { PickingId } from '../../../mol-geo/geometry/picking';
import { EmptyLocationIterator, LocationIterator } from '../../../mol-geo/util/location-iterator';
import { Sphere3D } from '../../../mol-math/geometry';
import { EmptyLoci, Loci } from '../../../mol-model/loci';
import { NullLocation } from '../../../mol-model/location';
import { ElementIndex, ResidueIndex, Structure, StructureElement, StructureProperties, Unit } from '../../../mol-model/structure';
import { CustomProperty } from '../../../mol-model-props/common/custom-property';
import { Representation, RepresentationContext, RepresentationParamsGetter } from '../../../mol-repr/representation';
import { ThemeRegistryContext } from '../../../mol-theme/theme';
import { StructureRepresentation, StructureRepresentationProvider, StructureRepresentationStateBuilder, UnitsRepresentation } from '../../../mol-repr/structure/representation';
import { StructureGroup } from '../../../mol-repr/structure/visual/util/common';
import { VisualUpdateState } from '../../../mol-repr/util';
import { VisualContext } from '../../../mol-repr/visual';
import { UnitsMeshParams, UnitsMeshVisual, UnitsVisual } from '../../../mol-repr/structure/units-visual';
import { Theme } from '../../../mol-theme/theme';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { MeshBuilder } from '../../../mol-geo/geometry/mesh/mesh-builder';
import { getNucleotideBaseType } from '../../../mol-repr/structure/visual/util/nucleotide';
import { Vec3, Mat4 } from '../../../mol-math/linear-algebra';
import { addCylinder } from '../../../mol-geo/geometry/mesh/builder/cylinder';
import { BasePairsLadderTypes } from './types';
import { addSphere } from '../../../mol-geo/geometry/mesh/builder/sphere';
import { Box } from '../../../mol-geo/primitive/box';

const firstAnchorPos = Vec3();
const secondAnchorPos = Vec3();
const midpoint = Vec3();
const unpairedBsCenter = Vec3();

// Brick helper vectors
const pN = Vec3();     // anchor N1/N9
const pC1p = Vec3();   // C1'
const pC4C2 = Vec3();  // C4 (purine) or C2 (pyrimidine)
const pC8C6 = Vec3();  // C8 (purine) or C6 (pyrimidine)
const xAxis = Vec3();
const yAxis = Vec3();
const zAxis = Vec3();
const brickCenter = Vec3();
const tmpVec = Vec3();

 // Build mesh params from runtime defaults (passed via plugin config / customState) or fallbacks.
 const BasePairsLadderMeshParamsFactory = (defaults: {
     barRadius: number,
     barScale: number,
     cWWBallRadius: number,
     cisBallRadius: number,
     transBallRadius: number,
     unpairedBallRadius: number,
     showPairs: boolean,
     showUnpaired: boolean,
     showUnpairedBall: boolean,
     showcWWBall: boolean,
     showCisBall: boolean,
     showTransBall: boolean,
     showBrick: boolean,
     brickLength: number,
     brickWidth: number,
     brickHeight: number,
 }) => ({
     ...UnitsMeshParams,
     barRadius: PD.Numeric(defaults.barRadius, { min: 0.1, max: 5.0, step: 0.1 }),
     barScale: PD.Numeric(defaults.barScale, { min: 0.1, max: 2.0, step: 0.1 }),
     cWWBallRadius: PD.Numeric(defaults.cWWBallRadius, { min: 0.1, max: 5.0, step: 0.1 }),
     cisBallRadius: PD.Numeric(defaults.cisBallRadius, { min: 0.1, max: 5.0, step: 0.1 }),
     transBallRadius: PD.Numeric(defaults.transBallRadius, { min: 0.1, max: 5.0, step: 0.1 }),
     unpairedBallRadius: PD.Numeric(defaults.unpairedBallRadius, { min: 0.1, max: 5.0, step: 0.1 }),
     showPairs: PD.Boolean(defaults.showPairs),
     showUnpaired: PD.Boolean(defaults.showUnpaired),
     showUnpairedBall: PD.Boolean(defaults.showUnpairedBall),
     showcWWBall: PD.Boolean(defaults.showcWWBall),
     showCisBall: PD.Boolean(defaults.showCisBall),
     showTransBall: PD.Boolean(defaults.showTransBall),
     // Brick display for unpaired bases
     showBrick: PD.Boolean(defaults.showBrick),
     brickLength: PD.Numeric(defaults.brickLength, { min: 0.2, max: 8.0, step: 0.1 }), // along base long axis (toward N1/N9)
     brickWidth: PD.Numeric(defaults.brickWidth, { min: 0.2, max: 6.0, step: 0.1 }),  // lateral extent
     brickHeight: PD.Numeric(defaults.brickHeight, { min: 0.1, max: 4.0, step: 0.1 })  // thickness normal to base plane
 });
 type BasePairsLadderMeshParams = ReturnType<typeof BasePairsLadderMeshParamsFactory>;
 
 // Hardcoded fallback defaults (used when plugin did not provide config)
 const HardcodedLadderDefaults = {
     barRadius: 0.5,
     barScale: 1.0,
     cWWBallRadius: 0.6,
     cisBallRadius: 0.6,
     transBallRadius: 1.2,
     unpairedBallRadius: 1.2,
     showPairs: true,
     showUnpaired: true,
     showUnpairedBall: false,
     showcWWBall: true,
     showCisBall: true,
     showTransBall: true,
     showBrick: true,
     brickLength: 4.0,
     brickWidth: 2.0,
     brickHeight: 0.6,
 } as const;

type ResidueWithUnit = {
    residue: Segmentation.Segment<ResidueIndex>,
    unit: Unit.Atomic,
};

function calcMidpoint(mp: Vec3, v: Vec3, w: Vec3) {
    Vec3.sub(mp, v, w);
    Vec3.scale(mp, mp, 0.5);
    Vec3.add(mp, mp, w);
}

function findAnchorAtom(r: ResidueWithUnit, alt_id: string, structure: Structure): ElementIndex {
    const baseType = getNucleotideBaseType(r.unit, r.residue.index);
    if (!isUsableBaseType(baseType)) return -1 as ElementIndex;

    const anchorAtomName = baseType.isPyrimidine ? 'N1' : 'N9';

    return findAtomInRange(anchorAtomName, alt_id, r.residue.start, r.residue.end, structure, r.unit);
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

function findResidueInUnit(asymId: string, seqId: number, insCode: string, structure: Structure, unit: Unit.Atomic): ResidueWithUnit | undefined {
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

/**
 * Add an oriented brick (box) for a nucleotide base using MeshBuilder primitives.
 * Returns true on success, false if required atoms are missing.
 */
function addNucleotideBrick(
    mb: MeshBuilder.State,
    unit: Unit.Atomic,
    residue: Segmentation.Segment<ResidueIndex>,
    structure: Structure,
    anchorAtom: ElementIndex,
    alt_id: string,
    baseType: { isPurine: boolean, isPyrimidine: boolean },
    props: PD.Values<BasePairsLadderMeshParams>
) {
    // Find C1' atom (to orient along sugar-to-base vector)
    const c1pAtom = findAtomInRange("C1'", alt_id, residue.start, residue.end, structure, unit);
    if (c1pAtom === -1) return false;

    // Select base plane atoms depending on base type
    const planeAtomA = baseType.isPurine ? 'C4' : 'C2';
    const planeAtomB = baseType.isPurine ? 'C8' : 'C6';

    const a1 = findAtomInRange(planeAtomA, alt_id, residue.start, residue.end, structure, unit);
    const a2 = findAtomInRange(planeAtomB, alt_id, residue.start, residue.end, structure, unit);
    if (a1 === -1 || a2 === -1) return false;

    // Positions
    unit.conformation.position(anchorAtom, pN);   // N1 / N9
    unit.conformation.position(c1pAtom, pC1p);    // C1'
    unit.conformation.position(a1, pC4C2);        // C4 or C2
    unit.conformation.position(a2, pC8C6);        // C8 or C6

    // X axis: from sugar (C1') toward anchor (N1/N9)
    Vec3.sub(xAxis, pC1p, pN);
    Vec3.normalize(xAxis, xAxis);

    // Z axis: normal to base plane (cross of two vectors in base plane)
    Vec3.sub(tmpVec, pC4C2, pN);
    Vec3.sub(brickCenter, pC8C6, pN);
    Vec3.cross(zAxis, tmpVec, brickCenter);
    Vec3.normalize(zAxis, zAxis);

    // Y axis: complete right-handed frame
    Vec3.cross(yAxis, zAxis, xAxis);
    Vec3.normalize(yAxis, yAxis);

    // Re-orthogonalize Z
    Vec3.cross(zAxis, xAxis, yAxis);
    Vec3.normalize(zAxis, zAxis);

    // Brick center: place so +X face center lies at N1/N9
    Vec3.scale(brickCenter, xAxis, -0.5 * props.brickLength);
    Vec3.add(brickCenter, brickCenter, pN);

    // Build transform matrix: columns are scaled basis vectors, last column is translation
    const m = Mat4.identity();
    // scale basis by dimensions (Box primitive spans [-0.5,0.5], so full size = dimension)
    m[0] = xAxis[0] * props.brickLength; m[4] = yAxis[0] * props.brickWidth;  m[8]  = zAxis[0] * props.brickHeight;
    m[1] = xAxis[1] * props.brickLength; m[5] = yAxis[1] * props.brickWidth;  m[9]  = zAxis[1] * props.brickHeight;
    m[2] = xAxis[2] * props.brickLength; m[6] = yAxis[2] * props.brickWidth;  m[10] = zAxis[2] * props.brickHeight;
    m[3] = 0; m[7] = 0; m[11] = 0;
    m[12] = brickCenter[0]; m[13] = brickCenter[1]; m[14] = brickCenter[2]; m[15] = 1;

    // Add Box primitive transformed by matrix
    MeshBuilder.addPrimitive(mb, m, Box());
    return true;
}

function getAnchorAtoms(first: BasePairsTypes.PairedBase, second: BasePairsTypes.PairedBase, structure: Structure, unit: Unit.Atomic) {
    const firstResidue = findResidueInUnit(first.asym_id, first.seq_id, first.PDB_ins_code, structure, unit);
    if (!firstResidue) {
        return void 0;
    }
    const secondResidue = findResidue(second.struct_oper_id, second.asym_id, second.seq_id, second.PDB_ins_code, structure);
    if (!secondResidue) {
        return void 0;
    }

    const firstAtom = findAnchorAtom(firstResidue, first.alt_id, structure);
    const secondAtom = findAnchorAtom(secondResidue, second.alt_id, structure);

    if (firstAtom === -1 || secondAtom === -1) return void 0;

    firstResidue.unit.conformation.position(firstAtom, firstAnchorPos);
    secondResidue.unit.conformation.position(secondAtom, secondAnchorPos);

    return {
        firstAtom: firstAnchorPos,
        secondAtom: secondAnchorPos,
    };
}

function calcStepPoints(first: BasePairsTypes.PairedBase, second: BasePairsTypes.PairedBase, structure: Structure, unit: Unit.Atomic) {
    const anchors = getAnchorAtoms(first, second, structure, unit);
    if (!anchors) return void 0;

    calcMidpoint(midpoint, anchors.firstAtom, anchors.secondAtom);

    return {
        firstAtom: anchors.firstAtom,
        secondAtom: anchors.secondAtom,
        midpoint,
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
            const auth_seq_id = StructureProperties.residue.auth_seq_id(loc);
            const PDB_ins_code = StructureProperties.residue.pdbx_PDB_ins_code(loc);
            const comp_id = StructureProperties.atom.label_comp_id(loc);
            const alt_id = StructureProperties.atom.label_alt_id(loc);

            const current = {
                asym_id, entity_id, seq_id, auth_seq_id, comp_id, PDB_ins_code
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
                            // draw sphere at anchor
                            if (props.showUnpairedBall) {
                                addSphere(mb, midpoint, props.unpairedBallRadius, 4);
                            }

                            // draw oriented brick if requested
                            if (props.showBrick) {
                                addNucleotideBrick(mb, unit, residue, structure, atom, alt_id, baseType, props);
                            }

                            break;
                        }
                    }
                } else if (item.kind === 'pair' && props.showPairs) {
                    const matching = isBasePairMatching(item, unit, current);
                    if (matching) {
                        const points = calcStepPoints(item.a, item.b, structure, unit);
                        if (!points) continue;
                        const { firstAtom, secondAtom, midpoint } = points;

                        mb.currentGroup = 3 * itemIdx;
                        addCylinder(mb, midpoint, firstAtom, props.barScale, cylinderProps);
                        mb.currentGroup = 3 * itemIdx + 1;
                        addCylinder(mb, midpoint, secondAtom, props.barScale, cylinderProps);
                        mb.currentGroup = 3 * itemIdx + 2;
                        if (item.orientation === 'cis' && props.showCisBall) {
                            addSphere(mb, midpoint, props.cisBallRadius, 4);
                        } else if (item.orientation === 'trans' && props.showTransBall) {
                            addSphere(mb, midpoint, props.transBallRadius, 4);
                        }
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

        let bs;
        const r = findResidueInUnit(item.residue.asym_id, item.residue.seq_id, item.residue.PDB_ins_code, structure, unit);
        const aa = r ? findAnchorAtom(r, '', structure) : -1;
        if (aa !== -1) {
            r!.unit.conformation.position(aa, unpairedBsCenter);
            bs = Sphere3D.create(unpairedBsCenter, 5.0);
        }

        return BasePairsLadderTypes.Loci([lociItem], [0], [offsetGroupId], bs);
    } else {
        const opposingUnit = structureGroup.group.units.length === 1
            ? unit
            : findOpposingUnit(unit.conformation.operator.assembly?.operList[0] ?? '', item, data, structureGroup.group.units);
        if (!opposingUnit) return EmptyLoci;

        const instanceNameA = unit.conformation?.operator.name;
        const instanceNameB = opposingUnit.conformation?.operator.name ?? '?';

        const points = calcStepPoints(item.a, item.b, structure, unit);
        const bs = points ? Sphere3D.create(points.midpoint, 5.0) : void 0;

        const lociItem = { ...item, instanceNameA, instanceNameB };
        return BasePairsLadderTypes.Loci([lociItem], [0], [offsetGroupId], bs);
    }
}

function eachBasePairsLadderStep(loci: Loci, structureGroup: StructureGroup, apply: (interval: Interval) => boolean) {
    if (BasePairsLadderTypes.isLoci(loci)) {
        const offsetGroupId = loci.elements[0];
        return apply(Interval.ofBounds(offsetGroupId, offsetGroupId + 3));
    }
    return false;
}

function BasePairsLadderVisual(materialId: number): UnitsVisual<BasePairsLadderParamsType> {
    return UnitsMeshVisual<typeof BasePairsLadderParams>({
        defaultProps: PD.getDefaultValues(BasePairsLadderParams),
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
                newProps.cWWBallRadius !== currentProps.cWWBallRadius ||
                newProps.cisBallRadius !== currentProps.cisBallRadius ||
                newProps.transBallRadius !== currentProps.transBallRadius ||
                newProps.unpairedBallRadius !== currentProps.unpairedBallRadius ||
                newProps.showPairs !== currentProps.showPairs ||
                newProps.showUnpaired !== currentProps.showUnpaired ||
                newProps.showUnpairedBall !== currentProps.showUnpairedBall ||
                newProps.showcWWBall !== currentProps.showcWWBall ||
                newProps.showCisBall !== currentProps.showCisBall ||
                newProps.showTransBall !== currentProps.showTransBall ||
                newProps.showBrick !== currentProps.showBrick ||
                newProps.brickLength !== currentProps.brickLength ||
                newProps.brickWidth !== currentProps.brickWidth ||
                newProps.brickHeight !== currentProps.brickHeight
            );
        },
        mustRecreate() {
            // Is this too heavy-handed?
            return true;
        },
    }, materialId);
}
const BasePairsLadderVisuals = {
    'base-pairs-ladder-symbol': (ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, BasePairsLadderParamsType>) => UnitsRepresentation('Base Pairs Ladder Symbol Mesh', ctx, getParams, BasePairsLadderVisual),
} as const;

// Create the parameter definition with default values
const BasePairsLadderParams = BasePairsLadderMeshParamsFactory(HardcodedLadderDefaults);
type BasePairsLadderParamsType = typeof BasePairsLadderParams;

function getBasePairsLadderParams(ctx: ThemeRegistryContext, structure: Structure): BasePairsLadderParamsType {
    // For now, just return the static parameter definition
    // In the future, this could be modified based on context or structure properties
    return BasePairsLadderParams;
}
 
 export type BasePairsLadderRepresentation = StructureRepresentation<BasePairsLadderParamsType>;
 export function BasePairsLadderRepresentation(ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, BasePairsLadderParamsType>): BasePairsLadderRepresentation {
     return Representation.createMulti('Base Pairs Ladder', ctx, getParams, StructureRepresentationStateBuilder, BasePairsLadderVisuals);
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
