import React from 'react';
import { ReDNATCOMspApi as Api } from './api';

type AssemblySelectorProps = {
    assemblies: Api.AssemblyInfo[];
    activeAssemblies: string[];
    enabled: boolean;
    onToggle: (assemblyId: string) => void;
};

export class AssemblySelector extends React.Component<AssemblySelectorProps> {
    render() {
        const { assemblies, activeAssemblies, enabled } = this.props;

        // Don't show if no assemblies are available yet
        if (assemblies.length === 0) {
            return null;
        }

        return (
            <div className="py-1 px-3 m-1 text-primary-first bg-molstar w-fit rounded-lg">
                <h2 className="capitalize min-w-[80px] font-roboto-bold">Assembly</h2>
                <div className="border-b-[.1px] my-1 border-primary" />
                <div className="flex flex-col">
                    {assemblies.map(assembly => {
                        const isActive = activeAssemblies.includes(assembly.id);
                        return (
                            <label
                                key={assembly.id}
                                className={`w-full text-left flex items-center my-1 p-1 rounded cursor-pointer ${isActive ? 'font-roboto-bold' : 'font-roboto-regular'} ${enabled ? '' : 'opacity-50'}`}
                                title={assembly.details || assembly.name}
                            >
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    disabled={!enabled}
                                    onChange={() => enabled && this.props.onToggle(assembly.id)}
                                    className="cursor-pointer mr-2"
                                />
                                {assembly.name}
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    }
}
