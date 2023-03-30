import { OrderedSet, Segmentation } from '../../mol-data/int';
import { EmptyLoci } from '../../mol-model/loci';
import { ResidueIndex, Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
import { structureUnion } from '../../mol-model/structure/query/utils/structure-set';
import { DnatcoUtil } from '../../extensions/dnatco/util';

export namespace Traverse {
    type Residue = Segmentation.Segment<ResidueIndex>;

    export function residueAltIds(structure: Structure, unit: Unit, residue: Residue) {
        DnatcoUtil.residueAltIds(structure, unit, residue);
    }

    export function findAtom(asymId: string, seqId: number, altId: string, insCode: string, atomId: string, loci: StructureElement.Loci, source: 'label' | 'auth') {
        const _loc = StructureElement.Location.create();
        _loc.structure = loci.structure;

        const getAsymId = source === 'label' ? StructureProperties.chain.label_asym_id : StructureProperties.chain.auth_asym_id;
        const getSeqId = source === 'label' ? StructureProperties.residue.label_seq_id : StructureProperties.residue.auth_seq_id;

        for (const e of loci.elements) {
            const chainIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.chainAtomSegments, e.unit.elements);
            const residueIt = Segmentation.transientSegments(e.unit.model.atomicHierarchy.residueAtomSegments, e.unit.elements);

            _loc.unit = e.unit;

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
                    if (_seqId !== seqId)
                        continue; // Wrong residue, skip it

                    for (let idx = residue.start; idx < residue.end; idx++) {
                        _loc.element = elemIndex(idx);

                        const _insCode = StructureProperties.residue.pdbx_PDB_ins_code(_loc);
                        const _altId = StructureProperties.atom.label_alt_id(_loc);
                        const _atomId = StructureProperties.atom.label_atom_id(_loc);

                        const match =
                            _asymId === asymId &&
                            _seqId === seqId &&
                            _insCode === insCode &&
                            (_altId === altId || altId === '') &&
                            _atomId === atomId;

                        if (match) {
                            const start = idx as StructureElement.UnitIndex;
                            const end = idx + 1 as StructureElement.UnitIndex;
                            return StructureElement.Loci(
                                loci.structure,
                                [{ unit: e.unit, indices: OrderedSet.ofBounds(start, end) }]
                            );
                        }
                    }
                }
            }
        }

        return EmptyLoci;
    }

    export function findResidue(asymId: string, seqId: number, altId: string | undefined, insCode: string, loci: StructureElement.Loci, source: 'label' | 'auth') {
        const rloci = DnatcoUtil.residueToLoci(asymId, seqId, altId, insCode, loci, source);
        return rloci.kind === 'element-loci' ? Structure.toStructureElementLoci(StructureElement.Loci.toStructure(rloci)) : EmptyLoci;
    }

    export function filterResidue(altId: string, loci: StructureElement.Loci) {
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

    export function findStep(
        asymId: string,
        seqId1: number, altId1: string | undefined, insCode1: string,
        seqId2: number, altId2: string | undefined, insCode2: string,
        loci: StructureElement.Loci, source: 'label' | 'auth'
    ) {
        const first = DnatcoUtil.residueToLoci(asymId, seqId1, altId1, insCode1, loci, source);
        if (first.kind === 'empty-loci')
            return EmptyLoci;

        const second = DnatcoUtil.residueToLoci(asymId, seqId2, altId2, insCode2, loci, source);
        if (second.kind === 'empty-loci')
            return EmptyLoci;

        const union = structureUnion(loci.structure, [StructureElement.Loci.toStructure(first), StructureElement.Loci.toStructure(second)]);
        return Structure.toStructureElementLoci(union);
    }
}
