import { PuckerClassLongName, PuckerResidue } from './property';

const RemoveNewline = /\r?\n/g;

export function puckerSphereLabel(residue: PuckerResidue): string {
    const ins = residue.insCode.length > 0 ? residue.insCode : '';
    return `
        <b>${residue.chain}</b> |
        <b>${residue.compId} ${residue.seqId}${ins}</b><br />
        <i>Pucker class:</i> <b>${residue.puckerClass}</b> (${PuckerClassLongName[residue.puckerClass]}) | <i>P:</i> ${residue.P.toFixed(1)}&deg; | ${residue.puckerName}
    `.replace(RemoveNewline, '');
}
