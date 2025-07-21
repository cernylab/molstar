export namespace BasePairsTypes {
    export const DataTag = 'base-pairs-base-in-pair';

    export type Item = UnpairedResidue | BasePair;

    export type Residue = {
        asym_id: string,
        entity_id: string,
        seq_id: number,
        comp_id: string,
        PDB_ins_code: string,
    }

    export type BaseEdge = 'watson-crick' | 'hoogsteen' | 'sugar';
    export type UnpairedResidue = {
        kind: 'unpaired',
        PDB_model_number: number,
        residue: Residue,
    };
    export type BasePair = {
        kind: 'pair',
        PDB_model_number: number,
        orientation: 'cis' | 'trans',
        a: PairedBase,
        b: PairedBase,
        is_coding: boolean,
    };

    // Groups items by seq_id
    export type SeqIdMap = Map<number, number[]>;
    // Groups SeqIdMaps by asym_id
    export type AsymIdMap = Map<string, SeqIdMap>;

    export interface Data {
        items: Item[],
        mapping: AsymIdMap[]; // Indices are model_nums - 1
    }

    export type PairedBase = Residue & {
        alt_id: string,
        struct_oper_id: string,
        base_edge: BaseEdge,
    };
}
