import { PuckerSpheresProvider, puckerResidueKey } from './property';
import { PuckerSpheresTypes } from './types';
import { Dnatco } from '../property';
import { Segmentation } from '../../../mol-data/int';
import { Mesh } from '../../../mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from '../../../mol-geo/geometry/mesh/mesh-builder';
import { addSphere } from '../../../mol-geo/geometry/mesh/builder/sphere';
import { PickingId } from '../../../mol-geo/geometry/picking';
import { LocationIterator } from '../../../mol-geo/util/location-iterator';
import { Vec3 } from '../../../mol-math/linear-algebra';
import { EmptyLoci, Loci } from '../../../mol-model/loci';
import { DataLocation, NullLocation } from '../../../mol-model/location';
import { Structure, StructureElement, StructureProperties, Unit } from '../../../mol-model/structure';
import { CustomProperty } from '../../../mol-model-props/common/custom-property';
import { Representation, RepresentationContext, RepresentationParamsGetter } from '../../../mol-repr/representation';
import { StructureRepresentation, StructureRepresentationProvider, StructureRepresentationStateBuilder, UnitsRepresentation } from '../../../mol-repr/structure/representation';
import { UnitsMeshParams, UnitsMeshVisual, UnitsVisual } from '../../../mol-repr/structure/units-visual';
import { VisualUpdateState } from '../../../mol-repr/util';
import { VisualContext } from '../../../mol-repr/visual';
import { StructureGroup } from '../../../mol-repr/structure/visual/util/common';
import { Theme, ThemeRegistryContext } from '../../../mol-theme/theme';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { Interval } from '../../../mol-data/int';

const RiboseAtomNames = new Set(["C1'", "C2'", "C3'", "C4'", "O4'", 'C1*', 'C2*', 'C3*', 'C4*', 'O4*']);

const tmpCom = Vec3();
const tmpAtomPos = Vec3();

export const PuckerSpheresMeshParams = {
    ...UnitsMeshParams,
    radius: PD.Numeric(1.5, { min: 0.1, max: 5.0, step: 0.1 }),
};
export type PuckerSpheresMeshParams = typeof PuckerSpheresMeshParams;

function createPuckerSpheresMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PD.Values<PuckerSpheresMeshParams>, mesh?: Mesh): Mesh {
    if (!Unit.isAtomic(unit)) return Mesh.createEmpty(mesh);

    const puckerData = PuckerSpheresProvider.get(structure.model)?.value?.data;
    if (!puckerData) return Mesh.createEmpty(mesh);

    const mb = MeshBuilder.createState(512, 128, mesh);
    const loc = StructureElement.Location.create(structure, unit, unit.elements[0]);

    const chainIt = Segmentation.transientSegments(unit.model.atomicHierarchy.chainAtomSegments, unit.elements);
    const residueIt = Segmentation.transientSegments(unit.model.atomicHierarchy.residueAtomSegments, unit.elements);

    while (chainIt.hasNext) {
        residueIt.setSegment(chainIt.move());
        while (residueIt.hasNext) {
            const residue = residueIt.move();

            loc.element = unit.elements[residue.start];
            const modelNum = StructureProperties.unit.model_num(loc);
            const chain = StructureProperties.chain.auth_asym_id(loc);
            const seqId = StructureProperties.residue.auth_seq_id(loc);
            const insCode = StructureProperties.residue.pdbx_PDB_ins_code(loc);

            const resIdx = puckerData.byKey.get(puckerResidueKey(modelNum, chain, seqId, insCode));
            if (resIdx === undefined) continue;

            Vec3.set(tmpCom, 0, 0, 0);
            let atomCount = 0;
            for (let eI = residue.start; eI < residue.end; eI++) {
                loc.element = unit.elements[eI];
                const atomName = StructureProperties.atom.label_atom_id(loc);
                if (!RiboseAtomNames.has(atomName)) continue;

                unit.conformation.invariantPosition(unit.elements[eI], tmpAtomPos);
                Vec3.add(tmpCom, tmpCom, tmpAtomPos);
                atomCount++;
            }

            if (atomCount === 0) continue;
            Vec3.scale(tmpCom, tmpCom, 1 / atomCount);

            mb.currentGroup = resIdx;
            addSphere(mb, tmpCom, props.radius, 2);
        }
    }

    return MeshBuilder.getMesh(mb);
}

function createPuckerSpheresIterator(structureGroup: StructureGroup): LocationIterator {
    const data = PuckerSpheresProvider.get(structureGroup.structure.model)?.value?.data;
    if (!data || data.residues.length === 0) return LocationIterator(0, 1, 1, () => NullLocation);
    const instanceCount = structureGroup.group.units.length;
    const { residues } = data;
    return LocationIterator(residues.length, instanceCount, 1, (groupIndex) => {
        if (groupIndex >= residues.length) return NullLocation;
        return DataLocation('pucker-spheres', residues[groupIndex], groupIndex);
    });
}

function getPuckerSphereLoci(pickingId: PickingId, structureGroup: StructureGroup, id: number): Loci {
    const { groupId, objectId, instanceId } = pickingId;
    if (objectId !== id) return EmptyLoci;

    const { structure } = structureGroup;
    const unit = structureGroup.group.units[instanceId];
    if (!Unit.isAtomic(unit)) return EmptyLoci;

    const data = PuckerSpheresProvider.get(structure.model)?.value?.data;
    if (!data) return EmptyLoci;
    if (groupId >= data.residues.length) return EmptyLoci;

    return PuckerSpheresTypes.Loci(data, [groupId]);
}

function eachPuckerSphere(loci: Loci, structureGroup: StructureGroup, apply: (interval: Interval) => boolean): boolean {
    return false;
}

function PuckerSpheresVisual(materialId: number): UnitsVisual<PuckerSpheresMeshParams> {
    return UnitsMeshVisual<PuckerSpheresMeshParams>({
        defaultProps: PD.getDefaultValues(PuckerSpheresMeshParams),
        createGeometry: createPuckerSpheresMesh,
        createLocationIterator: createPuckerSpheresIterator,
        getLoci: getPuckerSphereLoci,
        eachLocation: eachPuckerSphere,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<PuckerSpheresMeshParams>, currentProps: PD.Values<PuckerSpheresMeshParams>) => {
            state.createGeometry = newProps.radius !== currentProps.radius;
        },
    }, materialId);
}

const PuckerSpheresVisuals = {
    'pucker-spheres-symbol': (ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, PuckerSpheresMeshParams>) =>
        UnitsRepresentation('Pucker Spheres', ctx, getParams, PuckerSpheresVisual),
};

export const PuckerSpheresParams = { ...PuckerSpheresMeshParams };
export type PuckerSpheresParams = typeof PuckerSpheresParams;

export function getPuckerSpheresParams(ctx: ThemeRegistryContext, structure: Structure) {
    return PD.clone(PuckerSpheresParams);
}

export type PuckerSpheresRepresentation = StructureRepresentation<PuckerSpheresParams>;
export function PuckerSpheresRepresentation(ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, PuckerSpheresParams>): PuckerSpheresRepresentation {
    return Representation.createMulti('Pucker Spheres', ctx, getParams, StructureRepresentationStateBuilder, PuckerSpheresVisuals as unknown as Representation.Def<Structure, PuckerSpheresParams>);
}

export const PuckerSpheresRepresentationProvider = StructureRepresentationProvider({
    name: 'pucker-spheres',
    label: 'Pucker Spheres',
    description: 'Displays spheres at the ribose ring centre coloured by sugar pucker class',
    factory: PuckerSpheresRepresentation,
    getParams: getPuckerSpheresParams,
    defaultValues: PD.getDefaultValues(PuckerSpheresParams),
    defaultColorTheme: { name: 'pucker-spheres' },
    defaultSizeTheme: { name: 'uniform' },
    isApplicable: (structure: Structure) => structure.models.some(m => Dnatco.isApplicable(m)),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, structure: Structure) =>
            PuckerSpheresProvider.attach(ctx, structure.model, void 0, true),
        detach: (data) => PuckerSpheresProvider.ref(data.model, false),
    },
});
