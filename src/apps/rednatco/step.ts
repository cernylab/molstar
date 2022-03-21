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

    function residueDescription(a: string, b: string): { comp: string, altId?: string, resNo: number, insCode?: string }|undefined {
        const toksA = a.split('.');
        const toksB = b.split('.');

        if (toksA.length > 2 || toksB.length > 2)
            return void 0;

        const resNo = parseInt(toksB[0]);
        if (isNaN(resNo))
            return void 0;

        return {
            comp: toksA[0],
            altId: toksA.length === 2 ? toksA[1] : void 0,
            resNo,
            insCode: toksB.length === 2 ? toksB[1] : void 0,
        };
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

    export function fromName(name: string) {
        const description: Description = {
            model: -1,
            entryId: '',
            chain: '',
            resNo1: -1,
            comp1: '',
            altId1: void 0,
            insCode1: void 0,
            resNo2: -1,
            comp2: '',
            altId2: void 0,
            insCode2: void 0,
        };

        const toks = name.split('_');
        if (toks.length !== 6) {
            console.error(`String ${name} is not valid step name`);
            return void 0;
        }

        const entryTok = toks[0];
        const chain = toks[1];
        const res1TokA = toks[2];
        const res1TokB = toks[3];
        const res2TokA = toks[4];
        const res2TokB = toks[5];

        const ets = entryTok.split('-');
        if (ets.length === 1) {
            description.entryId = ets[0];
            description.model = 1;
        } else if (ets.length === 2) {
            description.entryId = ets[0];
            const m = parseInt(ets[1].slice(1));
            if (isNaN(m)) {
                console.error(`String ${name} is not valid step name`);
                return void 0;
            }
            description.model = m;
        } else {
            console.error(`String ${name} is not valid step name`);
            return void 0;
        }

        if (chain.length !== 1) {
            console.error(`String ${name} is not valid step name`);
            return void 0;
        } else
            description.chain = chain;

        const res1 = residueDescription(res1TokA, res1TokB);
        const res2 = residueDescription(res2TokA, res2TokB);
        if (!res1 || !res2) {
            console.error(`String ${name} is not valid step name`);
            return void 0;
        }

        description.resNo1 = res1.resNo;
        description.comp1 = res1.comp;
        description.altId1 = res1.altId;
        description.insCode1 = res1.insCode;
        description.resNo2 = res2.resNo;
        description.comp2 = res2.comp;
        description.altId2 = res2.altId;
        description.insCode2 = res2.insCode;

        return description;
    }

    export function is(loci: StructureElement.Loci) {
        const e = loci.elements[0];
        const loc = Location.create(loci.structure, e.unit, e.unit.elements[OrderedSet.getAt(e.indices, 0)]);

        const resNo1 = StructureProperties.residue.label_seq_id(loc);
        const asymId = StructureProperties.chain.label_asym_id(loc);
        for (let idx = 1; idx < OrderedSet.size(e.indices); idx++) {
            loc.element = e.unit.elements[OrderedSet.getAt(e.indices, idx)];

            const resNo = StructureProperties.residue.label_seq_id(loc);
            if (resNo !== resNo1 + 1)
                continue;
            const _asymId = StructureProperties.chain.label_asym_id(loc);
            if (_asymId === asymId)
                return true;
        }

        return false;
    }

    export function name(description: Description, multipleModels: boolean) {
        const res1 = nameResidue(description.resNo1, description.comp1, description.altId1, description.insCode1);
        const res2 = nameResidue(description.resNo2, description.comp2, description.altId2, description.insCode2);

        return `${description.entryId}${multipleModels ? `-m${description.model}` : ''}_${description.chain}_${res1}_${res2}`;
    }
}
