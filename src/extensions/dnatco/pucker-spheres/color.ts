import { PuckerClassIndex, PuckerClassLongName, PuckerResidue } from './property';
import { isDataLocation, Location } from '../../../mol-model/location';
import { ColorTheme } from '../../../mol-theme/color';
import { ThemeDataContext } from '../../../mol-theme/theme';
import { Color } from '../../../mol-util/color';
import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { TableLegend } from '../../../mol-util/legend';
import { ColorThemeCategory } from '../../../mol-theme/color/categories';

const Description = 'Colors pucker spheres by sugar pucker class';

export type PuckerColors = {
    N: Color; NE: Color; E: Color; SE: Color; S: Color; W: Color;
};

export const DefaultPuckerColors: PuckerColors = {
    N:  Color(0xffff00),
    NE: Color(0xffa500),
    E:  Color(0xff0000),
    SE: Color(0x008b8b),
    S:  Color(0x0000ff),
    W:  Color(0x808080),
};

export const PuckerSpheresColorThemeParams = {
    N:  PD.Color(DefaultPuckerColors.N,  { label: `N (${PuckerClassLongName.N})` }),
    NE: PD.Color(DefaultPuckerColors.NE, { label: `NE (${PuckerClassLongName.NE})` }),
    E:  PD.Color(DefaultPuckerColors.E,  { label: `E (${PuckerClassLongName.E})` }),
    SE: PD.Color(DefaultPuckerColors.SE, { label: `SE (${PuckerClassLongName.SE})` }),
    S:  PD.Color(DefaultPuckerColors.S,  { label: `S (${PuckerClassLongName.S})` }),
    W:  PD.Color(DefaultPuckerColors.W,  { label: `W (${PuckerClassLongName.W})` }),
};
export type PuckerSpheresColorThemeParams = typeof PuckerSpheresColorThemeParams;

const PuckerClassOrder: (keyof PuckerColors)[] = ['N', 'NE', 'E', 'SE', 'S', 'W'];

export function PuckerSpheresColorTheme(ctx: ThemeDataContext, props: PD.Values<PuckerSpheresColorThemeParams>): ColorTheme<PuckerSpheresColorThemeParams> {
    const colorArray: Color[] = PuckerClassOrder.map(k => props[k]);

    function color(location: Location): Color {
        if (isDataLocation(location) && location.tag === 'pucker-spheres') {
            const residue = location.data as PuckerResidue;
            if (residue && residue.puckerClass) {
                return colorArray[PuckerClassIndex[residue.puckerClass]] ?? Color(0xffffff);
            }
        }
        return Color(0xffffff);
    }

    return {
        factory: PuckerSpheresColorTheme,
        granularity: 'group',
        color,
        props,
        description: Description,
        legend: TableLegend(PuckerClassOrder.map(k => [k, props[k]] as [string, Color])),
    };
}

export function getPuckerSpheresColorThemeParams(_ctx: ThemeDataContext) {
    return PD.clone(PuckerSpheresColorThemeParams);
}

export const PuckerSpheresColorThemeProvider: ColorTheme.Provider<PuckerSpheresColorThemeParams, 'pucker-spheres'> = {
    name: 'pucker-spheres',
    label: 'Pucker Spheres',
    category: ColorThemeCategory.Residue,
    factory: PuckerSpheresColorTheme,
    getParams: getPuckerSpheresColorThemeParams,
    defaultValues: PD.getDefaultValues(PuckerSpheresColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => true,
};
