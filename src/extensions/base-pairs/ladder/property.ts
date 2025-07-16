import { BasePairs, BasePairsParams, Pairings } from '../property';
import { CustomPropertyDescriptor } from '../../../mol-model/custom-property';
import { Model } from '../../../mol-model/structure';
import { CustomProperty } from "../../../mol-model-props/common/custom-property";
import { CustomModelProperty } from '../../../mol-model-props/common/custom-model-property';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';

export const BasePairsLadderParams = { ...BasePairsParams };
export type BasePairsLadderParams = typeof BasePairsLadderParams;
export type BasePairsLadderProps = PD.Values<BasePairsLadderParams>;

export const BasePairsLadderProvider: CustomModelProperty.Provider<BasePairsLadderParams, Pairings> = CustomModelProperty.createProvider({
    label: 'Base pairs ladder',
    descriptor: CustomPropertyDescriptor({
        name: 'base-pairs-ladder',
    }),
    type: 'static',
    defaultParams: BasePairsLadderParams,
    getParams: (data: Model) => BasePairsLadderParams,
    isApplicable: (data: Model) => BasePairs.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<BasePairsLadderProps>) => {
        const p = { ...PD.getDefaultValues(BasePairsLadderParams), ...props };
        return BasePairs.fromCif(ctx, data, p);
    },
});
