import { Segmentation } from '../../mol-data/int';
import { EmptyLoci } from '../../mol-model/loci';
import { ResidueIndex, Structure, StructureElement, Unit } from '../../mol-model/structure';
import { structureUnion } from '../../mol-model/structure/query/utils/structure-set';
import { DnatcoUtil } from '../../extensions/dnatco/util';

export namespace Traverse {
    type Residue = Segmentation.Segment<ResidueIndex>;

    export function residueAltIds(structure: Structure, unit: Unit, residue: Residue) {
        DnatcoUtil.residueAltIds(structure, unit, residue);
    }

    export function findResidue(asymId: string, seqId: number, altId: string | undefined, insCode: string, loci: StructureElement.Loci, source: 'label' | 'auth') {
        return DnatcoUtil.residueToLoci(asymId, seqId, altId, insCode, loci, source);
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
