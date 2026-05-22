import { Dnatco } from '../property';
import { Column } from '../../../mol-data/db';
import { toTable } from '../../../mol-io/reader/cif/schema';
import { Model } from '../../../mol-model/structure';
import { CustomProperty } from '../../../mol-model-props/common/custom-property';
import { CustomModelProperty } from '../../../mol-model-props/common/custom-model-property';
import { CustomPropertyDescriptor } from '../../../mol-model/custom-property';
import { MmcifFormat } from '../../../mol-model-formats/structure/mmcif';
import { PropertyWrapper } from '../../../mol-model-props/common/wrapper';

export type PuckerClass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'W';

export const PuckerClassIndex: Record<PuckerClass, number> = {
    N: 0, NE: 1, E: 2, SE: 3, S: 4, W: 5,
};

export const PuckerClassLongName: Record<PuckerClass, string> = {
    N: 'North', NE: 'North-East', E: 'East', SE: 'South-East', S: 'South', W: 'West',
};

export function classifyPucker(P: number): PuckerClass {
    if (P > 324 || P <= 45) return 'N';
    if (P <= 72) return 'NE';
    if (P <= 108) return 'E';
    if (P <= 135) return 'SE';
    if (P <= 216) return 'S';
    return 'W';
}

// Converts LLKA short pucker names (e.g. "C3end", "C2exo") to long form ("C3'-endo", "C2'-exo")
export function puckerLongName(shortName: string): string {
    if (shortName.endsWith('end')) return shortName.slice(0, -3) + "'-endo";
    if (shortName.endsWith('exo')) return shortName.slice(0, -3) + "'-exo";
    return shortName;
}

export type PuckerResidue = {
    puckerClass: PuckerClass;
    P: number;
    puckerName: string;  // long name, e.g. "C3'-endo"
    chain: string;       // auth_asym_id
    seqId: number;       // auth_seq_id
    insCode: string;     // PDB_ins_code
    compId: string;      // label_comp_id
};

// key: `${modelNum}|${authAsymId}|${authSeqId}|${insCode}`
export type PuckerData = {
    residues: PuckerResidue[];
    byKey: Map<string, number>;  // puckerResidueKey → index into residues
};

export function puckerResidueKey(modelNum: number, chain: string, seqId: number, insCode: string) {
    return `${modelNum}|${chain}|${seqId}|${insCode}`;
}

const SugarSchema = {
    ndb_struct_sugar_step_parameters: {
        step_id: Column.Schema.int,
        P_1: Column.Schema.float,
        P_2: Column.Schema.float,
        Pn_1: Column.Schema.str,
        Pn_2: Column.Schema.str,
    },
};

function buildPuckerData(model: Model): PuckerData | undefined {
    const cifData = Dnatco.getCifData(model);
    if (!cifData) return undefined;

    if (!MmcifFormat.is(model.sourceData)) return undefined;
    const cats = model.sourceData.data.frame.categories;
    const puckerCat = cats['ndb_struct_sugar_step_parameters'];
    if (!puckerCat) return undefined;

    const puckerTable = toTable(SugarSchema.ndb_struct_sugar_step_parameters, puckerCat);
    const { step_id, P_1, P_2, Pn_1, Pn_2, _rowCount: nPucker } = puckerTable;

    const puckerByStepId = new Map<number, { P1: number, P2: number, Pn1: string, Pn2: string }>();
    for (let i = 0; i < nPucker; i++) {
        puckerByStepId.set(step_id.value(i), { P1: P_1.value(i), P2: P_2.value(i), Pn1: Pn_1.value(i), Pn2: Pn_2.value(i) });
    }

    const { id, PDB_model_number,
            auth_asym_id_1, auth_seq_id_1, PDB_ins_code_1, label_comp_id_1,
            auth_asym_id_2, auth_seq_id_2, PDB_ins_code_2, label_comp_id_2,
            _rowCount: nSteps } = cifData.steps;

    const residues: PuckerResidue[] = [];
    const byKey = new Map<string, number>();

    for (let i = 0; i < nSteps; i++) {
        const pEntry = puckerByStepId.get(id.value(i));
        if (!pEntry) continue;
        const modelNum = PDB_model_number.value(i);

        if (Number.isFinite(pEntry.P1)) {
            const key = puckerResidueKey(modelNum, auth_asym_id_1.value(i), auth_seq_id_1.value(i), PDB_ins_code_1.value(i));
            if (!byKey.has(key)) {
                byKey.set(key, residues.length);
                residues.push({
                    puckerClass: classifyPucker(pEntry.P1),
                    P: pEntry.P1,
                    puckerName: puckerLongName(pEntry.Pn1),
                    chain: auth_asym_id_1.value(i),
                    seqId: auth_seq_id_1.value(i),
                    insCode: PDB_ins_code_1.value(i),
                    compId: label_comp_id_1.value(i),
                });
            }
        }

        if (Number.isFinite(pEntry.P2)) {
            const key = puckerResidueKey(modelNum, auth_asym_id_2.value(i), auth_seq_id_2.value(i), PDB_ins_code_2.value(i));
            if (!byKey.has(key)) {
                byKey.set(key, residues.length);
                residues.push({
                    puckerClass: classifyPucker(pEntry.P2),
                    P: pEntry.P2,
                    puckerName: puckerLongName(pEntry.Pn2),
                    chain: auth_asym_id_2.value(i),
                    seqId: auth_seq_id_2.value(i),
                    insCode: PDB_ins_code_2.value(i),
                    compId: label_comp_id_2.value(i),
                });
            }
        }
    }

    return residues.length > 0 ? { residues, byKey } : undefined;
}

export const PuckerSpheresParams = {};
export type PuckerSpheresParams = typeof PuckerSpheresParams;

export const PuckerSpheresProvider: CustomModelProperty.Provider<PuckerSpheresParams, PropertyWrapper<PuckerData | undefined>> =
    CustomModelProperty.createProvider({
        label: 'Pucker Spheres',
        descriptor: CustomPropertyDescriptor({ name: 'pucker_spheres' }),
        type: 'static',
        defaultParams: PuckerSpheresParams,
        getParams: (_data: Model) => PuckerSpheresParams,
        isApplicable: (data: Model) => Dnatco.isApplicable(data),
        obtain: async (_ctx: CustomProperty.Context, data: Model) => {
            const info = PropertyWrapper.createInfo();
            return { value: { info, data: buildPuckerData(data) } };
        },
    });
