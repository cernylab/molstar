import { BasePairsLadderProvider } from './property';
import { BasePairsLadderTypes } from './types';
import { BasePairs } from '../property';
import { Location } from '../../../mol-model/location';
import { CustomProperty } from '../../../mol-model-props/common/custom-property';
import { ColorTheme } from '../../../mol-theme/color';
import { ColorThemeCategory } from '../../../mol-theme/color/categories';
import { ThemeDataContext } from '../../../mol-theme/theme';
import { Color } from '../../../mol-util/color';
import { TableLegend } from '../../../mol-util/legend';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { ObjectKeys } from '../../../mol-util/type-helpers';

const DefaultColor = Color(0xFFAAFF);

function toColorMapParams(defn: Record<string, Color>) {
    const params = {} as Record<string, PD.Color>;
    ObjectKeys(defn).forEach(k => {
        params[k] = PD.Color(defn[k], { label: k.replace('_', ' ') });
    });
    return params;
}

const DetailedLadderColors = {
    'Hoogsteen': Color(0x0F0FCD),
    'Sugar': Color(0xFF0000),
    'cWW_Complementary': Color(0xFAFAFA),
    'WW_Other': Color(0xFFFF00),
    'Cis_Ball': Color(0x363636),
    'Trans_Ball': Color(0xFAFAFA),
    Default: DefaultColor,
};

const SimpleLadderColors = {
    'Hoogsteen': Color(0xC70039),
    'Sugar': Color(0xC70039),
    'cWW_Complementary': Color(0xFAFAFA),
    'WW_Other': Color(0xC70039),
    'Cis_Ball': Color(0x363636),
    'Trans_Ball': Color(0xFAFAFA),
    Default: DefaultColor,
};

const DefaultLadderColors = {
    detailed: DetailedLadderColors,
    simple: SimpleLadderColors
};

export const BasePairsLadderColorThemeParams = {
    colors: PD.MappedStatic('default', {
        default: PD.EmptyGroup(),
        custom: PD.Group(toColorMapParams(DetailedLadderColors)),
    }),
    // Colors of the cis/trans base-pair balls. Defaults match the hardcoded
    // values above; overridden from config (basePairsLadder.cisBallColor / transBallColor).
    cisBallColor: PD.Color(Color(0x363636)),
    transBallColor: PD.Color(Color(0xFAFAFA)),
};
export type BasePairsLadderColorThemeParams = typeof BasePairsLadderColorThemeParams;

export function getBasePairsLadderColorThemeParams(ctx: ThemeDataContext) {
    return PD.clone(BasePairsLadderColorThemeParams);
}

export function BasePairsLadderColorTheme(ctx: ThemeDataContext, props: PD.Values<BasePairsLadderColorThemeParams>, variant: 'simple' | 'detailed'): ColorTheme<BasePairsLadderColorThemeParams> {
    const baseColorMap = props.colors.name === 'default' ? DefaultLadderColors[variant] : props.colors.params;
    const colorMap: Record<string, Color> = { ...baseColorMap, Cis_Ball: props.cisBallColor, Trans_Ball: props.transBallColor };

    function color(location: Location, isSecondary: boolean): Color {
        if (BasePairsLadderTypes.isLocation(location)) {
            const { object } = location.data;

            if (object.kind === 'base') {
                const { base } = object;
                if (base.base_edge === 'watson-crick') {
                    if (object.pair.is_coding) {
                        return colorMap.cWW_Complementary;
                    } else {
                        return colorMap.WW_Other;
                    }
                } else if (base.base_edge === 'hoogsteen') return colorMap.Hoogsteen;
                else if (base.base_edge === 'sugar') return colorMap.Sugar;
            } else if (object.kind === 'ball') {
                if (object.pair.orientation === 'cis') return colorMap.Cis_Ball;
                else return colorMap.Trans_Ball;
            } else if (object.kind === 'unpaired') {
                return colorMap.Default;
            }

            return colorMap.Default;
        } else {
            return colorMap.Default;
        }
    }

    return {
        factory: (ctx, props) => BasePairsLadderColorTheme(ctx, props, variant),
        granularity: 'group',
        color,
        props,
        description: 'Assigns colors to Base Pairs Ladder steps',
        legend: TableLegend(ObjectKeys(colorMap).map(k => [k.replace('_', ' '), colorMap[k]] as [string, Color])),
    };
}
export const BasePairsLadderSimpleColorThemeProvider: ColorTheme.Provider<BasePairsLadderColorThemeParams, 'base-pairs-ladder-simple'> = {
    name: 'base-pairs-ladder-simple',
    label: 'Base Pairs Ladder (Simple)',
    category: ColorThemeCategory.Residue,
    factory: (ctx, props) => BasePairsLadderColorTheme(ctx, props, 'simple'),
    getParams: getBasePairsLadderColorThemeParams,
    defaultValues: PD.getDefaultValues(BasePairsLadderColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => BasePairs.isApplicable(m)),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? BasePairsLadderProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && BasePairsLadderProvider.ref(data.structure.models[0], false)
    }
};

export const BasePairsLadderDetailedColorThemeProvider: ColorTheme.Provider<BasePairsLadderColorThemeParams, 'base-pairs-ladder-detailed'> = {
    name: 'base-pairs-ladder-detailed',
    label: 'Base Pairs Ladder (Detailed)',
    category: ColorThemeCategory.Residue,
    factory: (ctx, props) => BasePairsLadderColorTheme(ctx, props, 'detailed'),
    getParams: getBasePairsLadderColorThemeParams,
    defaultValues: PD.getDefaultValues(BasePairsLadderColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => BasePairs.isApplicable(m)),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? BasePairsLadderProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && BasePairsLadderProvider.ref(data.structure.models[0], false)
    }
};
