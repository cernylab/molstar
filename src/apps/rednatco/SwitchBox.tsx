import { useState, useEffect } from "react";
import { Switch } from "./Switch";

export default function SwitchBox({
  visible,
  name,
  options,
  onToggle,
  enabled,
}: {
  visible: boolean;
  name: string;
  options?: { name: string; function?: () => void }[];
  onToggle: () => void;
  enabled?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(visible);
  const [activeOption, setActiveOption] = useState(options && options[0]?.name);

  function handleSelect(option: { name: string; function?: () => void }) {
    setActiveOption(option.name);
    option.function?.();
  }

  function handleChange() {
    setIsVisible((item: any) => !item);
    onToggle();
  }

  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  return (
    <div className="py-2 px-3 m-2 text-primary-first bg-molstar w-fit rounded-lg">
      <div className="flex">
        <h2 className="capitalize min-w-[80px] font-roboto-bold">{name}</h2>
        <Switch checked={isVisible} onCheckedChange={handleChange} disabled={enabled === false}/>
      </div>

      {isVisible && options && (
        <>
          <div className="border-b-[.1px] my-2 border-primary" />
          {options.map((option) => (
            <button
              key={option.name}
              className={`w-full text-left flex my-1 p-1 rounded ${
                activeOption === option.name ? "font-roboto-bold" : "font-roboto-regular"
              }`}
              onClick={() => handleSelect(option)}
            >
              {option.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}