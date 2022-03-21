import { OrderedSet } from '../../mol-data/int/ordered-set';
import { StructureElement, StructureProperties } from '../../mol-model/structure';
import { Location } from '../../mol-model/structure/structure/element/location';

export namespace Step {
    export type Description = {
        model: number;
        entryId: string;
        chain: string;
        resNo1: number;
        comp1: string;
        altId1?: string;
        insCode1?: string;
        resNo2: number;
        comp2: string;
        altId2?: string;
        insCode2?: string;
    };

    function nameResidue(seqId: number, compId: string, altId?: string, insCode?: string) {
        return `${compId}${altId ? `.${altId}` : ''}_${seqId}${insCode ? `.${insCode}` : '' }`;
    }

    export function describe(loci: StructureElement.Loci) {
        const es = loci.elements[0]; // Ignore multiple selections

        const loc = Location.create(loci.structure, es.unit);
        loc.element = es.unit.elements[OrderedSet.getAt(es.indices, 0)]; // We're assuming a non-empty set

        const description: Description = {
            model: es.unit.model.modelNum,
            entryId: loci.structure.model.entryId.toLowerCase(),
            chain: StructureProperties.chain.auth_asym_id(loc),
            resNo1: StructureProperties.residue.auth_seq_id(loc),
            comp1: StructureProperties.atom.auth_comp_id(loc),
            altId1: StructureProperties.atom.label_alt_id(loc),
            insCode1: StructureProperties.residue.pdbx_PDB_ins_code(loc),
            resNo2: -1,
            comp2: '',
            altId2: void 0,
            insCode2: void 0,
        };

        let found = false;
        const len = OrderedSet.size(es.indices);
        for (let idx = 1; idx < len; idx++) {
            loc.element = es.unit.elements[OrderedSet.getAt(es.indices, idx)];
            if (StructureProperties.residue.auth_seq_id(loc) !== description.resNo1) {
                found = true;
                break;
            }
        }

        if (!found)
            return void 0;

        description.resNo2 = StructureProperties.residue.auth_seq_id(loc);
        description.comp2 = StructureProperties.atom.auth_comp_id(loc);
        description.altId2 = StructureProperties.atom.label_alt_id(loc);
        description.insCode2 = StructureProperties.residue.pdbx_PDB_ins_code(loc);

        return description;
    }

    export function name(description: Description, multipleModels: boolean) {
        const res1 = nameResidue(description.resNo1, description.comp1, description.altId1, description.insCode1);
        const res2 = nameResidue(description.resNo2, description.comp2, description.altId2, description.insCode2);

        return `${description.entryId}${multipleModels ? `-m${description.model}` : ''}_${description.chain}_${res1}_${res2}`;
    }
}
