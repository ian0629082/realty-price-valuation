"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface CommunityOption {
  id: string;
  name: string; // 建案名稱
  district: string;
  lat: number;
  lng: number;
}

interface Props {
  options: CommunityOption[]; // 當前載入區域的預售建案（已去重）
  onSelect: (opt: CommunityOption) => void;
}

// 預售屋「社區」搜尋：可下拉選當區建案，亦可手動輸入即時過濾（typeahead）。
// 選定後由父層飛到該建案並開啟資料卡。
export default function CommunitySearch({ options, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // 鍵盤高亮的選項索引
  const boxRef = useRef<HTMLDivElement>(null);

  // 過濾：名稱包含輸入字串（忽略大小寫）；空字串顯示全部
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : options;
    return list.slice(0, 100); // 防呆：最多列 100 筆，避免一次渲染過多
  }, [options, query]);

  // 點擊元件外部即收合下拉
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // 過濾結果變動時，重置鍵盤高亮位置
  useEffect(() => {
    setActive(0);
  }, [query, open]);

  const choose = (opt: CommunityOption) => {
    setQuery(opt.name);
    setOpen(false);
    onSelect(opt);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-xs font-medium text-slate-500 mb-1">社區</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder={`搜尋建案（共 ${options.length} 筆）`}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 text-sm bg-white"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 w-5 h-5 flex items-center justify-center"
            aria-label="清除"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <ul className="absolute z-[1003] mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-slate-400">查無符合的建案</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                    i === active ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="truncate text-slate-800">{o.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{o.district}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
