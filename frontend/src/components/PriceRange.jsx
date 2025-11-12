import { useState, useEffect } from "react";
import { toFa } from "../utils/number";

/**
 * PriceRange Component
 * A controlled dual-thumb range slider with synchronized numeric inputs
 *
 * Props:
 *   min: number (minimum price)
 *   max: number (maximum price)
 *   value: [number, number] (current range [minPrice, maxPrice])
 *   onChange: (v: [number, number]) => void (callback when range changes)
 *   minCap: number (absolute minimum, default 0)
 *   maxCap: number (absolute maximum, default 5000000)
 */
const PriceRange = ({
  value = [0, 5000000],
  onChange = () => {},
  minCap = 0,
  maxCap = 5000000,
}) => {
  const [localMin, setLocalMin] = useState(value[0]);
  const [localMax, setLocalMax] = useState(value[1]);

  // Sync with external value changes
  useEffect(() => {
    setLocalMin(value[0]);
    setLocalMax(value[1]);
  }, [value]);

  // Clamp value between min and max
  const clampValue = (val, lowerBound, upperBound) => {
    return Math.max(lowerBound, Math.min(val, upperBound));
  };

  // Handle min input change (slider or number input)
  const handleMinChange = (newMin) => {
    const clamped = clampValue(newMin, minCap, localMax - 1);
    setLocalMin(clamped);
    onChange([clamped, localMax]);
  };

  // Handle max input change (slider or number input)
  const handleMaxChange = (newMax) => {
    const clamped = clampValue(newMax, localMin + 1, maxCap);
    setLocalMax(clamped);
    onChange([localMin, clamped]);
  };

  // Calculate percentage for slider thumb positioning
  const getPercent = (value) => {
    return ((value - minCap) / (maxCap - minCap)) * 100;
  };

  const minPercent = getPercent(localMin);
  const maxPercent = getPercent(localMax);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200/60 space-y-4">
      {/* Dual Range Slider */}
      <div className="relative pt-2 pb-6">
        {/* Track Background */}
        <div className="absolute top-5 left-0 right-0 h-2 bg-gray-200 rounded-full pointer-events-none" />

        {/* Highlighted Track Between Thumbs */}
        <div
          className="absolute top-5 h-2 bg-primary-500 rounded-full pointer-events-none transition-all duration-100"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }}
        />

        {/* Min Slider (RTL: right side) */}
        <input
          type="range"
          min={minCap}
          max={maxCap}
          value={localMin}
          onChange={(e) => handleMinChange(parseInt(e.target.value, 10))}
          className="absolute w-full top-2 h-2 bg-transparent rounded-lg appearance-none cursor-pointer pointer-events-none z-5 accent-primary-500"
          style={{
            WebkitAppearance: "slider-horizontal",
            zIndex: localMin > maxCap - (maxCap - minCap) / 2 ? "5" : "3",
          }}
          aria-label="قیمت کمینه"
        />

        {/* Max Slider (RTL: left side) */}
        <input
          type="range"
          min={minCap}
          max={maxCap}
          value={localMax}
          onChange={(e) => handleMaxChange(parseInt(e.target.value, 10))}
          className="absolute w-full top-2 h-2 bg-transparent rounded-lg appearance-none cursor-pointer pointer-events-none z-4 accent-primary-500"
          style={{
            WebkitAppearance: "slider-horizontal",
            zIndex: "4",
          }}
          aria-label="قیمت بیشینه"
        />

        {/* Custom Slider Track Styling */}
        <style>{`
          input[type="range"] {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 8px;
            background: transparent;
            border-radius: 9999px;
            outline: none;
            pointer-events: none;
          }

          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            border: 3px solid #3b82f6;
            cursor: pointer;
            pointer-events: auto;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: box-shadow 0.2s;
          }

          input[type="range"]::-webkit-slider-thumb:hover {
            box-shadow: 0 2px 12px rgba(59, 130, 246, 0.4);
          }

          input[type="range"]::-webkit-slider-thumb:active {
            box-shadow: 0 2px 16px rgba(59, 130, 246, 0.6);
          }

          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            border: 3px solid #3b82f6;
            cursor: pointer;
            pointer-events: auto;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: box-shadow 0.2s;
          }

          input[type="range"]::-moz-range-thumb:hover {
            box-shadow: 0 2px 12px rgba(59, 130, 246, 0.4);
          }

          input[type="range"]::-moz-range-thumb:active {
            box-shadow: 0 2px 16px rgba(59, 130, 246, 0.6);
          }

          input[type="range"]::-moz-range-track {
            background: transparent;
            border: none;
          }

          input[type="range"]::-moz-range-progress {
            background: transparent;
          }
        `}</style>
      </div>

      {/* Numeric Inputs */}
      <div className="grid grid-cols-2 gap-3">
        {/* Min Price Input */}
        <div className="text-right">
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            از
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 flex-shrink-0">تومان</span>
            <input
              type="number"
              min={minCap}
              max={localMax - 1}
              value={localMin}
              onChange={(e) =>
                handleMinChange(parseInt(e.target.value, 10) || 0)
              }
              className="flex-1 p-2.5 border border-gray-300 rounded-lg bg-white text-sm text-left placeholder:text-gray-400 hover:border-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 font-tabular"
              placeholder="0"
              aria-label="قیمت کمینه"
            />
          </div>
        </div>

        {/* Max Price Input */}
        <div className="text-right">
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            تا
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 flex-shrink-0">تومان</span>
            <input
              type="number"
              min={localMin + 1}
              max={maxCap}
              value={localMax}
              onChange={(e) =>
                handleMaxChange(parseInt(e.target.value, 10) || maxCap)
              }
              className="flex-1 p-2.5 border border-gray-300 rounded-lg bg-white text-sm text-left placeholder:text-gray-400 hover:border-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 font-tabular"
              placeholder={String(maxCap)}
              aria-label="قیمت بیشینه"
            />
          </div>
        </div>
      </div>

      {/* Price Summary */}
      <div className="pt-2 text-center text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
        <span className="font-semibold text-gray-900">
          {toFa(localMin.toLocaleString("fa-IR"))} تومان
        </span>
        <span className="mx-1 opacity-50">تا</span>
        <span className="font-semibold text-gray-900">
          {toFa(localMax.toLocaleString("fa-IR"))} تومان
        </span>
      </div>
    </div>
  );
};

export default PriceRange;
