import { OrderedSet } from '../../mol-data/int';
import { StructureElement, StructureProperties } from '../../mol-model/structure';

const _loc = StructureElement.Location.create();
export namespace Residue {
    export type Description = {
        modelNum: number,
        chain: string,
        cifChain: string,
        seqId: number,
        insCode: string,
        altId: string,
    }

    export function describe(loci: StructureElement.Loci): Description {
        const elems = loci.elements[0];

        _loc.structure = loci.structure;
        _loc.unit = elems.unit;

        // Get most of the information from the first atom
        _loc.element = OrderedSet.getAt(_loc.unit.elements, OrderedSet.getAt(elems.indices, 0));

        const description = {
            modelNum: StructureProperties.unit.model_num(_loc),
            chain: StructureProperties.chain.auth_asym_id(_loc),
            cifChain: StructureProperties.chain.label_asym_id(_loc),
            seqId: StructureProperties.residue.auth_seq_id(_loc),
            insCode: StructureProperties.residue.pdbx_PDB_ins_code(_loc),
            altId: StructureProperties.atom.label_alt_id(_loc),
        };

        const N = OrderedSet.size(elems.indices);
        for (let idx = 1; idx < N; idx++) {
            if (description.altId !== '')
                break;

            _loc.element = OrderedSet.getAt(_loc.unit.elements, OrderedSet.getAt(elems.indices, idx));
            description.altId = StructureProperties.atom.label_alt_id(_loc);
        }

        return description;
    }
}
