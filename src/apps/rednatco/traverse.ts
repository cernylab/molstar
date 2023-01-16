import { Segmentation } from '../../mol-data/int';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { EmptyLoci } from '../../mol-model/loci';
import { ResidueIndex, Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
import { structureUnion } from '../../mol-model/structure/query/utils/structure-set';
import { Location } from '../../mol-model/structure/structure/element/location';

export namespace Traverse {
    type Residue = Segmentation.Segment<ResidueIndex>;

    export function residueAltIds(structure: Structure, unit: Unit, residue: Residue) {
        const altIds = new Array<string>();
        const loc = Location.create(structure, unit);
        for (let rI = residue.start; rI < residue.end; rI++) {
            loc.element = OrderedSet.getAt(unit.elements, rI);
            const altId = StructureProperties.atom.label_alt_id(loc);
            if (altId !== '' && !altIds.includes(altId))
                altIds.push(altId);
        }

        return altIds;
    }

    // TODO: We will be able to use a function from DnatcoUtils once it gets upstreamed
    const _loc = StructureElement.Location.create();
    export function findResidue(asymId: string, seqId: number, altId: string | undefined, insCode: string, loci: StructureElement.Loci, source: 'label' | 'auth') {
        _loc.structure = loci.structure;
        for (const e of loci.elements) {
            _loc.unit = e.unit;

            const getAsymId = source === 'label' ? StructureProperties.chain.label_asym_id : StructureProperties.chain.auth_asym_id;
            const getSeqId = source === 'label' ? StructureProperties.residue.label_seq_id : StructureProperties.residue.auth_seq_id;

            // Walk the entire unit and look for the requested residue
            const chainIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.chainAtomSegments, e.unit.elements);
            const residueIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.residueAtomSegments, e.unit.elements);

            const elemIndex = (idx: number) => OrderedSet.getAt(e.unit.elements, idx);
            while (chainIt.hasNext) {
                const chain = chainIt.move();
                _loc.element = elemIndex(chain.start);
                const _asymId = getAsymId(_loc);
                if (_asymId !== asymId)
                    continue; // Wrong chain, skip it

                residueIt.setSegment(chain);
                while (residueIt.hasNext) {
                    const residue = residueIt.move();
                    _loc.element = elemIndex(residue.start);

                    const _seqId = getSeqId(_loc);
                    if (_seqId === seqId) {
                        const _insCode = StructureProperties.residue.pdbx_PDB_ins_code(_loc);
                        if (_insCode !== insCode)
                            continue;

                        if (altId) {
                            const _altIds = residueAltIds(loci.structure, e.unit, residue);
                            if (!_altIds.includes(altId))
                                continue;
                        }

                        const start = residue.start as StructureElement.UnitIndex;
                        const end = residue.end as StructureElement.UnitIndex;
                        return StructureElement.Loci(
                            loci.structure,
                            [{ unit: e.unit, indices: OrderedSet.ofBounds(start, end) }]
                        );
                    }
                }
            }
        }

        return EmptyLoci;
    }

    export function findStep(
        asymId: string,
        seqId1: number, altId1: string | undefined, insCode1: string,
        seqId2: number, altId2: string | undefined, insCode2: string,
        loci: StructureElement.Loci, source: 'label' | 'auth'
    ) {
        const first = findResidue(asymId, seqId1, altId1, insCode1, loci, source);
        if (first.kind === 'empty-loci')
            return EmptyLoci;

        const second = findResidue(asymId, seqId2, altId2, insCode2, loci, source);
        if (second.kind === 'empty-loci')
            return EmptyLoci;

        const union = structureUnion(loci.structure, [StructureElement.Loci.toStructure(first), StructureElement.Loci.toStructure(second)]);
        return Structure.toStructureElementLoci(union);
    }
}
