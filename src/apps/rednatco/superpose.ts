import { SymmetryOperator } from '../../mol-math/geometry/symmetry-operator';
import { MinimizeRmsd } from '../../mol-math/linear-algebra/3d/minimize-rmsd';
import { ElementIndex } from '../../mol-model/structure';

export namespace Superpose {
    export type Input = {
        elements: ElementIndex[],
        conformation: SymmetryOperator.ArrayMapping<ElementIndex>,
    }

    export function positions(points: ElementIndex[], conformation: SymmetryOperator.ArrayMapping<ElementIndex>) {
        const positions = MinimizeRmsd.Positions.empty(points.length);

        points.forEach((v, idx) => {
            positions.x[idx] = conformation.x(v);
            positions.y[idx] = conformation.y(v);
            positions.z[idx] = conformation.z(v);
        });

        return positions;
    }

    export function superposition(ofWhat: Input, onto: Input) {
        const a = Superpose.positions(onto.elements, onto.conformation);
        const b = Superpose.positions(ofWhat.elements, ofWhat.conformation);

        return MinimizeRmsd.compute({ a, b });
    }
}
