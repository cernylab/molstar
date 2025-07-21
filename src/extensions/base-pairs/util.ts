import { BasePairsTypes } from './types';

export namespace BasePairsUtil {
    export function areResiduesMatching(expected: BasePairsTypes.Residue, actual: BasePairsTypes.Residue) {
        return (
            expected.asym_id === actual.asym_id &&
            expected.entity_id === actual.entity_id &&
            expected.seq_id === actual.seq_id &&
            expected.PDB_ins_code === actual.PDB_ins_code
        );
    }
}
