"use client";

import type { Priority } from "@/lib/kanban";

export type PriorityFilter = Priority | "all";
export type DueDateFilter = "all" | "overdue" | "today" | "upcoming" | "none";

export type FilterState = {
  searchText: string;
  priority: PriorityFilter;
  dueDate: DueDateFilter;
};

export const defaultFilter: FilterState = {
  searchText: "",
  priority: "all",
  dueDate: "all",
};

export const isFilterActive = (f: FilterState) =>
  f.searchText !== "" || f.priority !== "all" || f.dueDate !== "all";

const PRIORITY_CHIPS: { value: PriorityFilter; label: string; active: string; inactive: string }[] = [
  { value: "low", label: "Low", active: "bg-[var(--primary-blue)] text-white", inactive: "border-[rgba(32,157,215,0.4)] text-[var(--primary-blue)]" },
  { value: "medium", label: "Med", active: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]", inactive: "border-[rgba(236,173,10,0.5)] text-[#a07800]" },
  { value: "high", label: "High", active: "bg-orange-500 text-white", inactive: "border-orange-300 text-orange-600" },
  { value: "critical", label: "Crit", active: "bg-red-600 text-white", inactive: "border-red-300 text-red-600" },
];

const DUE_DATE_CHIPS: { value: DueDateFilter; label: string; active: string; inactive: string }[] = [
  { value: "overdue", label: "Overdue", active: "bg-red-600 text-white", inactive: "border-red-300 text-red-600" },
  { value: "today", label: "Today", active: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]", inactive: "border-[rgba(236,173,10,0.5)] text-[#a07800]" },
  { value: "upcoming", label: "Upcoming", active: "bg-[var(--primary-blue)] text-white", inactive: "border-[rgba(32,157,215,0.4)] text-[var(--primary-blue)]" },
  { value: "none", label: "No date", active: "bg-[var(--gray-text)] text-white", inactive: "border-[var(--stroke)] text-[var(--gray-text)]" },
];

type FilterBarProps = {
  filter: FilterState;
  onChange: (next: FilterState) => void;
};

export const FilterBar = ({ filter, onChange }: FilterBarProps) => {
  const active = isFilterActive(filter);

  return (
    <div
      role="search"
      aria-label="Filter cards"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur"
    >
      <div className="relative flex-shrink-0">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gray-text)]"
          width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"
        >
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search cards"
          aria-label="Search cards"
          value={filter.searchText}
          onChange={(e) => onChange({ ...filter, searchText: e.target.value })}
          className="rounded-full border border-[var(--stroke)] py-1.5 pl-7 pr-3 text-xs font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] w-36"
        />
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gray-text)]">Priority</span>
      {PRIORITY_CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          aria-pressed={filter.priority === chip.value}
          aria-label={`Filter by ${chip.value} priority`}
          onClick={() =>
            onChange({ ...filter, priority: filter.priority === chip.value ? "all" : chip.value })
          }
          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
            filter.priority === chip.value ? chip.active : `bg-transparent ${chip.inactive} hover:opacity-80`
          }`}
        >
          {chip.label}
        </button>
      ))}

      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gray-text)] ml-1">Due</span>
      {DUE_DATE_CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          aria-pressed={filter.dueDate === chip.value}
          aria-label={`Filter by due date: ${chip.label}`}
          onClick={() =>
            onChange({ ...filter, dueDate: filter.dueDate === chip.value ? "all" : chip.value })
          }
          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
            filter.dueDate === chip.value ? chip.active : `bg-transparent ${chip.inactive} hover:opacity-80`
          }`}
        >
          {chip.label}
        </button>
      ))}

      {active ? (
        <button
          type="button"
          onClick={() => onChange(defaultFilter)}
          aria-label="Clear filters"
          className="ml-auto rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
};
