"use client";

import React, { useMemo, useState } from "react";
import { Pie, ProvidedProps, PieArcDatum } from "@visx/shape";
import { scaleOrdinal } from "@visx/scale";
import { Group } from "@visx/group";
import { GradientPinkBlue } from "@visx/gradient";
import { animated, useTransition, interpolate } from "@react-spring/web";

export type ActivitySlice = {
  label: string;
  value: number;
};

const defaultMargin = { top: 20, right: 20, bottom: 20, left: 20 };

const sliceValue = (d: ActivitySlice) => d.value;

export type UserActivityPieChartProps = {
  width: number;
  height: number;
  data: ActivitySlice[];
  margin?: typeof defaultMargin;
  animate?: boolean;
};

export function UserActivityPieChart({
  width,
  height,
  data,
  margin = defaultMargin,
  animate = true,
}: UserActivityPieChartProps) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const domain = useMemo(() => data.map((d) => d.label), [data]);
  const palette = [
    "rgba(255,255,255,0.88)",
    "rgba(255,255,255,0.68)",
    "rgba(255,255,255,0.48)",
    "rgba(186,148,255,0.95)",
    "rgba(186,148,255,0.65)",
    "rgba(93,30,91,0.95)",
    "rgba(93,30,91,0.65)",
  ];
  const getSliceColor = useMemo(
    () =>
      scaleOrdinal({
        domain,
        range: domain.map((_, i) => palette[i % palette.length]),
      }),
    [domain]
  );

  if (width < 10 || data.length === 0) {
    return null;
  }

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const radius = Math.min(innerWidth, innerHeight) / 2;
  const centerY = innerHeight / 2;
  const centerX = innerWidth / 2;
  const donutThickness = Math.min(50, radius * 0.35);

  const pieData = selectedLabel ? data.filter(({ label }) => label === selectedLabel) : data;

  return (
    <svg width={width} height={height}>
      <GradientPinkBlue id="visx-user-activity-pie-gradient" />
      <rect rx={14} width={width} height={height} fill="url('#visx-user-activity-pie-gradient')" />
      <Group top={centerY + margin.top} left={centerX + margin.left}>
        <Pie
          data={pieData}
          pieValue={sliceValue}
          outerRadius={radius}
          innerRadius={radius - donutThickness}
          cornerRadius={3}
          padAngle={0.02}
        >
          {(pie) => (
            <AnimatedPie<ActivitySlice>
              {...pie}
              animate={animate}
              getKey={(arc) => arc.data.label}
              onClickDatum={({ data: { label } }) =>
                animate && setSelectedLabel(selectedLabel === label ? null : label)
              }
              getColor={(arc) => getSliceColor(arc.data.label)}
            />
          )}
        </Pie>
      </Group>
      {animate && (
        <text
          textAnchor="end"
          x={width - 16}
          y={height - 16}
          fill="white"
          fontSize={11}
          fontWeight={300}
          pointerEvents="none"
        >
          Click a segment to focus
        </text>
      )}
    </svg>
  );
}

type AnimatedStyles = { startAngle: number; endAngle: number; opacity: number };

const fromLeaveTransition = <Datum,>({ endAngle }: PieArcDatum<Datum>) => ({
  startAngle: endAngle > Math.PI ? 2 * Math.PI : 0,
  endAngle: endAngle > Math.PI ? 2 * Math.PI : 0,
  opacity: 0,
});

const enterUpdateTransition = <Datum,>({ startAngle, endAngle }: PieArcDatum<Datum>) => ({
  startAngle,
  endAngle,
  opacity: 1,
});

type AnimatedPieProps<Datum> = ProvidedProps<Datum> & {
  animate?: boolean;
  getKey: (d: PieArcDatum<Datum>) => string;
  getColor: (d: PieArcDatum<Datum>) => string;
  onClickDatum: (d: PieArcDatum<Datum>) => void;
};

function AnimatedPie<Datum>({
  animate,
  arcs,
  path,
  getKey,
  getColor,
  onClickDatum,
}: AnimatedPieProps<Datum>) {
  const transitions = useTransition<PieArcDatum<Datum>, AnimatedStyles>(arcs, {
    from: animate ? fromLeaveTransition : enterUpdateTransition,
    enter: enterUpdateTransition,
    update: enterUpdateTransition,
    leave: animate ? fromLeaveTransition : enterUpdateTransition,
    keys: getKey,
  });

  return transitions((props, arc, { key }) => {
    const [centroidX, centroidY] = path.centroid(arc);
    const hasSpaceForLabel = arc.endAngle - arc.startAngle >= 0.12;

    return (
      <g key={key}>
        <animated.path
          d={interpolate([props.startAngle, props.endAngle], (startAngle, endAngle) =>
            path({
              ...arc,
              startAngle,
              endAngle,
            })
          )}
          fill={getColor(arc)}
          onClick={() => onClickDatum(arc)}
          onTouchStart={() => onClickDatum(arc)}
        />
        {hasSpaceForLabel && (
          <animated.g style={{ opacity: props.opacity }}>
            <text
              fill="white"
              x={centroidX}
              y={centroidY}
              dy=".33em"
              fontSize={10}
              textAnchor="middle"
              pointerEvents="none"
            >
              {getKey(arc)}
            </text>
          </animated.g>
        )}
      </g>
    );
  });
}
