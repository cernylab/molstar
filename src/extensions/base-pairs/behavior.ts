import { BasePairsLadderPreset } from './ladder/behavior';
import { BasePairsLadderColorThemeProvider } from './ladder/color';
import { BasePairsLadderProvider } from './ladder/property';
import { BasePairsLadderRepresentationProvider } from './ladder/representation';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { PluginBehavior } from '../../mol-plugin/behavior';

export const BasePairs = PluginBehavior.create<{ autoAttach: boolean, showToolTip: boolean }>({
    name: 'base-pairs',
    category: 'custom-props',
    display: {
        name: 'Base pairs interacting edges',
        description: 'Base pairs interacting edges',
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean, showToolTip: boolean }> {
        register(): void {
            this.ctx.customModelProperties.register(BasePairsLadderProvider, this.params.autoAttach);

            this.ctx.representation.structure.themes.colorThemeRegistry.add(BasePairsLadderColorThemeProvider);
            this.ctx.representation.structure.registry.add(BasePairsLadderRepresentationProvider);

            this.ctx.builders.structure.representation.registerPreset(BasePairsLadderPreset);
        }

        unregister() {
            this.ctx.customModelProperties.unregister(BasePairsLadderProvider.descriptor.name);

            this.ctx.representation.structure.registry.remove(BasePairsLadderRepresentationProvider);
            this.ctx.representation.structure.themes.colorThemeRegistry.remove(BasePairsLadderColorThemeProvider);

            this.ctx.builders.structure.representation.unregisterPreset(BasePairsLadderPreset);
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(true),
        showToolTip: PD.Boolean(true),
    })
});
