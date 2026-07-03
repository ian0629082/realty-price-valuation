"use client";

import { useState } from "react";

interface Props {
  value: string; // YYYY-MM，空字串＝不限
  min: string; // YYYY-MM
  max: string; // YYYY-MM
  placeholder: string;
  onChange: (value: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

// 自製月份選擇器：點開後於欄位下方「內嵌展開」年份切換 + 月份格狀點選，
// 不用原生彈窗（會被側欄裁切、跑出畫面）。
export default function MonthField({ value, min, max, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [minY, minM] = min.split("-").map(Number);
  const [maxY, maxM] = max.split("-").map(Number);
  const [viewYear, setViewYear] = useState(value ? Number(value.slice(0, 4)) : maxY);

  const monthEnabled = (m: number) =>
    (viewYear > minY || m >= minM) && (viewYear < maxY || m <= maxM);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border border-slate-300 rounded-lg px-2 py-1 text-sm text-left bg-white flex justify-between items-center"
      >
        <span className={value ? "" : "text-slate-400"}>
          {value ? value.replace("-", "/") : placeholder}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-sm p-2">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              disabled={viewYear <= minY}
              onClick={() => setViewYear((y) => y - 1)}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-sm font-medium">{viewYear} 年</span>
            <button
              type="button"
              disabled={viewYear >= maxY}
              onClick={() => setViewYear((y) => y + 1)}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const enabled = monthEnabled(m);
              const selected = value === `${viewYear}-${pad(m)}`;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    onChange(`${viewYear}-${pad(m)}`);
                    setOpen(false);
                  }}
                  className={`text-xs rounded py-1 ${
                    selected
                      ? "bg-blue-600 text-white"
                      : enabled
                      ? "hover:bg-blue-50 text-gray-800"
                      : "text-gray-300"
                  }`}
                >
                  {m} 月
                </button>
              );
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-2 w-full text-xs text-gray-500 hover:text-gray-800"
            >
              清除（不限）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
