import { Segmentation } from '../../mol-data/int';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { EmptyLoci, Loci } from '../../mol-model/loci';
import { ResidueIndex, Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
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

    export function findResidue(asymId: string, seqId: number, altId: string|undefined, loci: StructureElement.Loci, source: 'label'|'auth') {
        for (const e of loci.elements) {
            const loc = Location.create(loci.structure, e.unit);

            const getAsymId = source === 'label' ? StructureProperties.chain.label_asym_id : StructureProperties.chain.auth_asym_id;
            const getSeqId = source === 'label' ? StructureProperties.residue.label_seq_id : StructureProperties.residue.auth_seq_id;

            // Walk the entire unit and look for the requested residue
            const chainIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.chainAtomSegments, e.unit.elements);
            const residueIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.residueAtomSegments, e.unit.elements);

            const elemIndex = (idx: number) => OrderedSet.getAt(e.unit.elements, idx);
            while (chainIt.hasNext) {
                const chain = chainIt.move();
                loc.element = elemIndex(chain.start);
                const _asymId = getAsymId(loc);
                if (_asymId !== asymId)
                    continue; // Wrong chain, skip it

                residueIt.setSegment(chain);
                while (residueIt.hasNext) {
                    const residue = residueIt.move();
                    loc.element = elemIndex(residue.start);

                    const _seqId = getSeqId(loc);
                    if (_seqId === seqId) {
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

    export function residue(shift: number, altId: string|undefined, cursor: StructureElement.Loci) {
        for (const e of cursor.elements) {
            const entireUnit = cursor.structure.units[e.unit.id];
            const loc = Location.create(cursor.structure, e.unit);

            loc.element = e.unit.elements[OrderedSet.getAt(e.indices, 0)];
            const asymId = StructureProperties.chain.label_asym_id(loc);
            const seqId = StructureProperties.residue.label_seq_id(loc);

            const from = 0 as StructureElement.UnitIndex;
            const to = entireUnit.elements.length as StructureElement.UnitIndex;

            const loci = findResidue(
                asymId,
                seqId + shift,
                altId,
                StructureElement.Loci(cursor.structure, [{ unit: entireUnit, indices: OrderedSet.ofBounds(from, to) }]),
                'label'
            );
            if (!Loci.isEmpty(loci))
                return loci;
        }
        return EmptyLoci;
    }
}
