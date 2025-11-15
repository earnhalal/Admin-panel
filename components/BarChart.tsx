import React, { useMemo } from 'react';

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
  }[];
}

interface BarChartProps {
  data: ChartData;
}

const BarChart: React.FC<BarChartProps> = ({ data }) => {
  const { labels, datasets } = data;
  const dataset = datasets[0]; // Assuming single dataset for simplicity

  const maxValue = useMemo(() => {
    const max = Math.max(...dataset.data);
    return max === 0 ? 10 : Math.ceil(max / 5) * 5; // Round up to nearest 5
  }, [dataset.data]);

  const yAxisLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= 5; i++) {
      labels.push(Math.round((maxValue / 5) * i));
    }
    return labels;
  }, [maxValue]);

  return (
    <div className="w-full h-full flex flex-col text-xs text-gray-500 dark:text-gray-400">
      {/* Y-Axis and Chart Area */}
      <div className="flex-grow flex">
        {/* Y-Axis Labels */}
        <div className="flex flex-col justify-between h-full pr-4 text-right">
          {yAxisLabels.slice().reverse().map(label => (
            <div key={`y-label-${label}`}>{label}</div>
          ))}
        </div>
        {/* Grid and Bars */}
        <div className="flex-grow grid grid-cols-7 gap-4 relative">
          {/* Grid Lines */}
          {yAxisLabels.map((_, index) => (
            <div
              key={`grid-line-${index}`}
              className="col-span-7 border-t border-dashed border-gray-200 dark:border-slate-800"
              style={{ position: 'absolute', top: `${(index / (yAxisLabels.length - 1)) * 100}%`, left: 0, right: 0 }}
            ></div>
          ))}
          {/* Bars */}
          {dataset.data.map((value, index) => (
            <div key={`bar-${index}`} className="flex flex-col justify-end items-center h-full">
              <div
                className="w-3/4 bg-indigo-500 rounded-t-md hover:bg-indigo-400 transition-colors"
                style={{ height: `${(value / maxValue) * 100}%` }}
                title={`${labels[index]}: ${value}`}
              ></div>
            </div>
          ))}
        </div>
      </div>
      {/* X-Axis Labels */}
      <div className="flex pl-12 pt-2">
        {labels.map(label => (
          <div key={`x-label-${label}`} className="flex-1 text-center">{label}</div>
        ))}
      </div>
    </div>
  );
};

export default BarChart;
