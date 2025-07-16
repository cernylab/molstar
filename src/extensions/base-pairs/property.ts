import { BasePairsTypes } from './types';
import { Column, Table } from '../../mol-data/db';
import { toTable } from '../../mol-io/reader/cif/schema';
import { CustomProperty } from '../../mol-model-props/common/custom-property';
import { PropertyWrapper } from '../../mol-model-props/common/wrapper';
import { Model } from '../../mol-model/structure';
import { MmcifFormat } from '../../mol-model-formats/structure/mmcif';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { mmCIF_Schema } from '../../mol-io/reader/cif/schema/mmcif';

export type Pairings = PropertyWrapper<BasePairsTypes.Data | undefined>;

export const BasePairsParams = {};
export type BasePairsParams = typeof BasePairsParams;
export type BasePairsProps = PD.Values<BasePairsParams>;

function updateMapping(subject: {
    modelIdx: number,
    mapping: BasePairsTypes.AsymIdMap[],
    asym_id: string,
    seq_id: number,
}, items: BasePairsTypes.Item[]) {
    const { modelIdx, mapping, asym_id, seq_id } = subject;
    const asymIdMap = mapping[modelIdx];
    const seqIdMap = asymIdMap.get(asym_id) ?? new Map();
    const itemsPerSeqId = seqIdMap.get(seq_id) ?? [];
    itemsPerSeqId.push(items.length - 1);

    seqIdMap.set(seq_id, itemsPerSeqId);
    asymIdMap.set(asym_id, seqIdMap);
}

export namespace BasePairs {
    export const Schema = {
        ndb_base_pair_list: {
            base_pair_id: Column.Schema.int,
            PDB_model_number: Column.Schema.int,
            asym_id_1: Column.Schema.str,
            entity_id_1: Column.Schema.str,
            seq_id_1: Column.Schema.int,
            comp_id_1: Column.Schema.str,
            PDB_ins_code_1: Column.Schema.str,
            alt_id_1: Column.Schema.str,
            struct_oper_id_1: Column.Schema.str,
            asym_id_2: Column.Schema.str,
            entity_id_2: Column.Schema.str,
            seq_id_2: Column.Schema.int,
            comp_id_2: Column.Schema.str,
            PDB_ins_code_2: Column.Schema.str,
            alt_id_2: Column.Schema.str,
            struct_oper_id_2: Column.Schema.str,
        },
        ndb_base_pair_annotation: {
            id: Column.Schema.int,
            base_pair_id: Column.Schema.int,
            orientation: Column.Schema.str,
            base_1_edge: Column.Schema.str,
            base_2_edge: Column.Schema.str,
            'l-w_family_num': Column.Schema.int,
            'l-w_family': Column.Schema.str,
            class: Column.Schema.str,
            subclass: Column.Schema.str,
        },
        atom_site: mmCIF_Schema.atom_site,
        pdbx_struct_oper_list: mmCIF_Schema.pdbx_struct_oper_list,
    };
    export type Schema = typeof Schema;

    export function getBasePairsFromCif(
        annotation: Table<typeof BasePairs.Schema.ndb_base_pair_annotation>,
        list: Table<typeof BasePairs.Schema.ndb_base_pair_list>,
        atom_site: Table<typeof BasePairs.Schema.atom_site>
    ) {
        const basePairs = makeBasePairs(annotation, list);
        const { _rowCount: atom_site_row_count } = atom_site;

        // We need to walk the entire structure to figure out what bases ar *not*
        // paired because the base_pair list contains only the paired residues.

        const items = new Array<BasePairsTypes.Item>();
        const mapping = new Array<BasePairsTypes.AsymIdMap>();

        let last_PDB_model_number = -1;
        let last_seq_id = -1;
        for (let idx = 0; idx < atom_site_row_count; idx++) {
            const PDB_model_number = atom_site.pdbx_PDB_model_num.value(idx);
            const modelIdx = PDB_model_number - 1;
            if (last_PDB_model_number !== PDB_model_number) {
                last_PDB_model_number = PDB_model_number;
                last_seq_id = -1;

                if (mapping[modelIdx] === undefined) {
                    mapping[modelIdx] = new Map();
                }
            }

            const seq_id = atom_site.label_seq_id.value(idx);
            if (seq_id === last_seq_id) continue;

            last_seq_id = seq_id;

            const asym_id = atom_site.label_asym_id.value(idx);
            const entity_id = atom_site.label_entity_id.value(idx);
            const comp_id = atom_site.label_comp_id.value(idx);
            const PDB_ins_code = atom_site.pdbx_PDB_ins_code.value(idx);

            let unpaired = true;
            for (const bp of basePairs) {
                if (bp.PDB_model_number !== PDB_model_number) continue;
                if (isBaseMatching(bp.a, asym_id, entity_id, seq_id, PDB_ins_code)) {
                    items.push(bp);
                    unpaired = false;

                    updateMapping({ modelIdx, mapping, asym_id, seq_id }, items);
                } else if (isBaseMatching(bp.b, asym_id, entity_id, seq_id, PDB_ins_code)) {
                    // We do not want to create duplicit items in the list but
                    // we still want to mark this residue as paired
                    unpaired = false;
                }
            }

            if (unpaired) {
                // We are not checking if the unpaired residue is a NA base
                // This is intentional because there is no easy way to detect if the residue
                // is a NA base that we could use here.
                // We will skip any non-NA residues during rendering
                items.push({
                    kind: 'unpaired',
                    PDB_model_number,
                    residue: {
                        asym_id,
                        entity_id,
                        seq_id,
                        comp_id,
                        PDB_ins_code,
                    }
                });

                updateMapping({ modelIdx, mapping, asym_id, seq_id }, items);
            }
        }

        return { items, mapping };
    }

    export function getCifData(model: Model) {
        if (!MmcifFormat.is(model.sourceData)) throw new Error('Data format must be mmCIF');
        if (!hasRequiredCategories(model)) return undefined;
        return {
            annotations: toTable(Schema.ndb_base_pair_annotation, model.sourceData.data.frame.categories.ndb_base_pair_annotation),
            list: toTable(Schema.ndb_base_pair_list, model.sourceData.data.frame.categories.ndb_base_pair_list),
            atom_site: toTable(Schema.atom_site, model.sourceData.data.frame.categories.atom_site),
        };
    }

    export async function fromCif(ctx: CustomProperty.Context, model: Model, props: BasePairsProps): Promise<CustomProperty.Data<Pairings>> {
        const info = PropertyWrapper.createInfo();
        const data = getCifData(model);
        if (!data) return { value: { info, data: void 0 } };

        const fromCif = getBasePairsFromCif(data.annotations, data.list, data.atom_site);
        return { value: { info, data: fromCif } };
    }

    export function isApplicable(model?: Model) {
        return !!model && hasRequiredCategories(model);
    }

    const RequiredCategories = [
        'ndb_base_pair_list',
        'ndb_base_pair_annotation',
        'atom_site',
    ];
    function hasRequiredCategories(model: Model) {
        if (!MmcifFormat.is(model.sourceData)) return false;
        const names = (model.sourceData).data.frame.categoryNames;
        return RequiredCategories.every(name => names.includes(name));
    }

    function isBaseMatching(
        base: BasePairsTypes.PairedBase,
        asym_id: string, entity_id: string, seq_id: number, ins_code: string,
    ) {
        return (
            base.asym_id === asym_id &&
            base.entity_id === entity_id &&
            base.seq_id === seq_id &&
            base.PDB_ins_code === ins_code
        );
    }

    function makeBasePairs(
        annotation: Table<typeof BasePairs.Schema.ndb_base_pair_annotation>,
        list: Table<typeof BasePairs.Schema.ndb_base_pair_list>
    ) {
        const { _rowCount: annotation_row_count } = annotation;
        const { _rowCount: list_row_count } = list;

        if (annotation_row_count !== list_row_count) throw new Error('Inconsistent mmCIF data');

        const pairs = [];
        for (let idx = 0; idx < annotation_row_count; idx++) {
            const bp = getBasePair(idx, annotation, list);
            pairs.push(bp);
        }

        return pairs;
    }
}

function intoBaseEdge(edge: string) {
    edge = edge.toLowerCase();
    if (edge === 'watson-crick') return 'watson-crick';
    else if (edge === 'hoogsteen') return 'hoogsteen';
    else if (edge === 'sugar') return 'sugar';

    throw new Error(`Unknown base edge ${edge}`);
}

function intoOrientation(os: string) {
    const o = os[0];
    if (o === 'c') return 'cis';
    else if (o === 't') return 'trans';

    throw new Error(`Unknown orientation ${o}`);
}

const ComplementaryBases = [
    ['A', 'U'],
    ['C', 'G'],
    ['DA', 'DT'],
    ['DC', 'DG']
];
function isBpComplementary(a: string, b: string) {
    for (const [pa, pb] of ComplementaryBases) {
        if ((pa === a && pb === b) || (pa === b && pb === a)) return true;
    }

    return false;
}

function getBasePair(
    index: number,
    annotation: Table<typeof BasePairs.Schema.ndb_base_pair_annotation>,
    list: Table<typeof BasePairs.Schema.ndb_base_pair_list>
): BasePairsTypes.BasePair {
    const base_pair_id = annotation.base_pair_id.value(index);
    let listIndex = -1;
    for (let r = 0; r < list._rowCount; r++) {
        if (list.base_pair_id.value(r) === base_pair_id) {
            listIndex = r;
            break;
        }
    }
    if (listIndex === -1) throw new Error(`base_pair_id ${base_pair_id} not present in ndb_base_pair_list table`);

    const comp_id_a = list.comp_id_1.value(listIndex);
    const comp_id_b = list.comp_id_2.value(listIndex);
    const orientation = intoOrientation(annotation.orientation.value(index));
    const base_edge_1 = intoBaseEdge(annotation.base_1_edge.value(index));
    const base_edge_2 = intoBaseEdge(annotation.base_2_edge.value(index));

    return {
        kind: 'pair',
        PDB_model_number: list.PDB_model_number.value(listIndex),
        orientation,
        is_coding: isBpComplementary(comp_id_a, comp_id_b) &&
            orientation === 'cis' &&
            base_edge_1 === 'watson-crick' &&
            base_edge_2 === 'watson-crick',
        a: {
            asym_id: list.asym_id_1.value(listIndex),
            entity_id: list.entity_id_1.value(listIndex),
            seq_id: list.seq_id_1.value(listIndex),
            comp_id: comp_id_a,
            PDB_ins_code: list.PDB_ins_code_1.value(listIndex),
            alt_id: list.alt_id_1.value(listIndex),
            struct_oper_id: list.struct_oper_id_1.value(listIndex),
            base_edge: base_edge_1,
        },
        b: {
            asym_id: list.asym_id_2.value(listIndex),
            entity_id: list.entity_id_2.value(listIndex),
            seq_id: list.seq_id_2.value(listIndex),
            comp_id: comp_id_b,
            PDB_ins_code: list.PDB_ins_code_2.value(listIndex),
            alt_id: list.alt_id_2.value(listIndex),
            struct_oper_id: list.struct_oper_id_2.value(listIndex),
            base_edge: base_edge_2,
        }
    };
}
