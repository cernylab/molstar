import { Filters } from './filters';
import { Expression } from '../../mol-script/language/expression';
import { MolScriptBuilder as MSB } from '../../mol-script/language/builder';
import { formatMolScript } from '../../mol-script/language/expression-formatter';

export namespace Filtering {
    function empty() {
        return MSB.struct.generator.all();
    }

    function sliceExpr(slice: Filters.Slices['slices'][0]) {
        let expr = MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_asym_id(), slice.chain]);

        if (slice.residues && slice.residues.length > 0) {
            let _expr = MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_seq_id(), slice.residues[0]]);
            for (let idx = 1; idx < slice.residues.length; idx++) {
                _expr = MSB.core.logic.or([
                    _expr,
                    MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.auth_seq_id(), slice.residues[idx]])
                ]);
            }
            expr = MSB.core.logic.and([expr, _expr]);
        }

        if (slice.altIds && slice.altIds.length > 0) {
            let _expr = MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.label_alt_id(), slice.altIds[0]]);
            for (let idx = 1; idx < slice.altIds.length; idx++) {
                _expr = MSB.core.logic.or([
                    _expr,
                    MSB.core.rel.eq([MSB.struct.atomProperty.macromolecular.label_alt_id(), slice.altIds[idx]])
                ]);
            }

            expr = MSB.core.logic.and([expr, _expr]);
        }

        return expr;
    }

    function slices(slices: Filters.Slices['slices']) {
        if (slices.length > 0) {
            let expr = sliceExpr(slices[0]);

            for (let idx = 1; idx < slices.length; idx++) {
                expr = MSB.core.logic.or([
                    expr,
                    sliceExpr(slices[idx])
                ]);
            }

            expr = MSB.struct.generator.atomGroups({ 'atom-test': expr, 'group-by': MSB.struct.atomProperty.macromolecular.auth_asym_id() });
            console.log(formatMolScript(expr));

            return expr;
        }
        return MSB.struct.generator.all();
    }

    export function toExpression(filter: Filters.All): Expression {
        switch (filter.kind) {
            case 'empty':
                return empty();
            case 'slices':
                return slices(filter.slices);
        }
    }
}
