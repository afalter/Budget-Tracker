import { useState, useEffect } from "react";
import { Interval } from "../types";
import type { Account, CategoryColor } from "../types";

interface EntryFormData {
  name: string;
  amount: number;
  interval: Interval;
  startDate: string;
  endDate?: string;
  category?: string;
  active: boolean;
  isVariable?: boolean;
  isTransfer?: boolean;
  transferToAccountId?: string;
}

interface Props {
  mode: "income" | "expense";
  initial?: Partial<EntryFormData>;
  accounts?: Account[];
  categories?: CategoryColor[];
  onSubmit: (data: EntryFormData) => void;
  onCancel: () => void;
}

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: Interval.ONE_TIME, label: "One Time" },
  { value: Interval.DAILY, label: "Daily" },
  { value: Interval.WEEKLY, label: "Weekly" },
  { value: Interval.BIWEEKLY, label: "Biweekly" },
  { value: Interval.MONTHLY, label: "Monthly" },
  { value: Interval.BIMONTHLY, label: "Bimonthly" },
  { value: Interval.QUARTERLY, label: "Quarterly" },
  { value: Interval.YEARLY, label: "Yearly" },
];

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function toDateInput(value?: string): string {
  if (!value) return "";
  return value.split("T")[0];
}

function CategoryPicker({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (val: string) => void;
  categories: CategoryColor[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");

  const searchTerm = search.toLowerCase();
  const filtered = searchTerm
    ? categories.filter((c) => c.name.toLowerCase().includes(searchTerm))
    : categories;

  const currentCat = categories.find((c) => c.name === value);
  const hasExactMatch = categories.some((c) => c.name.toLowerCase() === searchTerm);

  function handleSelect(name: string) {
    onChange(name);
    setOpen(false);
    setSearch("");
    setCustomName("");
  }

  function handleCreateCustom() {
    const name = customName.trim() || search.trim();
    if (!name) return;
    onChange(name);
    setOpen(false);
    setSearch("");
    setCustomName("");
  }

  return (
    <div className="form-control">
      <label className="label">
        <span className="label-text">Category (optional)</span>
      </label>
      <button
        type="button"
        className="btn btn-sm btn-outline justify-start gap-2 font-normal"
        onClick={() => setOpen(true)}
      >
        {currentCat ? (
          <>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: currentCat.color }} />
            {currentCat.name}
          </>
        ) : value ? (
          <>
            <span className="w-3 h-3 rounded-full shrink-0 bg-base-content/30" />
            {value}
          </>
        ) : (
          <span className="text-base-content/50">Select a category...</span>
        )}
      </button>

      {open && (
        <dialog className="modal modal-open" onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setSearch(""); } }}>
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-base mb-3">Select Category</h3>

            {/* Search */}
            <input
              type="text"
              className="input input-bordered input-sm w-full mb-3"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />

            {/* Category list */}
            <div className="space-y-1 max-h-60 overflow-y-auto mb-3">
              {/* Clear option */}
              <button
                type="button"
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  !value ? "bg-primary/10 border border-primary/30" : "hover:bg-base-200"
                }`}
                onClick={() => handleSelect("")}
              >
                <span className="w-4 h-4 rounded-full shrink-0 border-2 border-dashed border-base-content/30" />
                <span className="text-base-content/50 italic">No category</span>
              </button>

              {filtered.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    value === cat.name ? "bg-primary/10 border border-primary/30" : "hover:bg-base-200"
                  }`}
                  onClick={() => handleSelect(cat.name)}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{cat.name}</span>
                    {cat.description && (
                      <p className="text-xs text-base-content/50 truncate">{cat.description}</p>
                    )}
                  </div>
                </button>
              ))}

              {filtered.length === 0 && search && (
                <p className="text-sm text-base-content/50 text-center py-3">
                  No matching categories
                </p>
              )}
            </div>

            {/* Create new category inline */}
            <div className="border-t border-base-content/10 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">
                Or create a new category
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-bordered input-sm flex-1"
                  placeholder={search && !hasExactMatch ? search : "New category name..."}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleCreateCustom(); }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleCreateCustom}
                  disabled={!customName.trim() && !search.trim()}
                >
                  Use
                </button>
              </div>
              {search && !hasExactMatch && !customName && (
                <p className="text-xs text-base-content/50 mt-1">
                  Press "Use" to create "{search}" as a new category
                </p>
              )}
            </div>

            <div className="modal-action">
              <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setSearch(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

export default function EntryForm({ mode, initial, accounts, categories, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [interval, setInterval] = useState<Interval>(
    initial?.interval ?? Interval.MONTHLY
  );
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate) || todayString());
  const [endDate, setEndDate] = useState(toDateInput(initial?.endDate));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [isVariable, setIsVariable] = useState(initial?.isVariable ?? false);
  const [isTransfer, setIsTransfer] = useState(initial?.isTransfer ?? false);
  const [transferToAccountId, setTransferToAccountId] = useState(initial?.transferToAccountId ?? "");

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? "");
      setAmount(initial.amount?.toString() ?? "");
      setInterval(initial.interval ?? Interval.MONTHLY);
      setStartDate(toDateInput(initial.startDate) || todayString());
      setEndDate(toDateInput(initial.endDate));
      setCategory(initial.category ?? "");
      setIsVariable(initial.isVariable ?? false);
      setIsTransfer(initial.isTransfer ?? false);
      setTransferToAccountId(initial.transferToAccountId ?? "");
    }
  }, [initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!name.trim() || isNaN(parsed)) return;

    const data: EntryFormData = {
      name: name.trim(),
      amount: parsed,
      interval,
      startDate,
      active: initial?.active ?? true,
    };

    if (mode === "expense") {
      if (endDate) data.endDate = endDate;
      if (category.trim()) data.category = category.trim();
      data.isVariable = isVariable;
      data.isTransfer = isTransfer;
      if (isTransfer && transferToAccountId) {
        data.transferToAccountId = transferToAccountId;
      }
    }

    onSubmit(data);
  }

  const hasOtherAccounts = accounts && accounts.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-base-200 rounded-lg">
      <div className="form-control">
        <label className="label">
          <span className="label-text">Name</span>
        </label>
        <input
          type="text"
          className="input input-bordered input-sm w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={mode === "income" ? "Salary" : "Rent"}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-control">
          <label className="label">
            <span className="label-text">Amount ($)</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input input-bordered input-sm w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">Interval</span>
          </label>
          <select
            className="select select-bordered select-sm w-full"
            value={interval}
            onChange={(e) => setInterval(e.target.value as Interval)}
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`grid gap-3 ${mode === "expense" ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="form-control">
          <label className="label">
            <span className="label-text">Start Date</span>
          </label>
          <input
            type="date"
            className="input input-bordered input-sm w-full"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>

        {mode === "expense" && (
          <div className="form-control">
            <label className="label">
              <span className="label-text">End Date (optional)</span>
            </label>
            <input
              type="date"
              className="input input-bordered input-sm w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        )}
      </div>

      {mode === "expense" && (
        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-warning"
              checked={isVariable}
              onChange={(e) => setIsVariable(e.target.checked)}
              aria-label="Variable price"
            />
            <span className="label-text">Variable price</span>
          </label>
          {isVariable && (
            <p className="text-xs text-base-content/60 ml-1 -mt-1">
              You can add price changes after saving.
            </p>
          )}
        </div>
      )}

      {mode === "expense" && hasOtherAccounts && (
        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-info"
              checked={isTransfer}
              onChange={(e) => {
                setIsTransfer(e.target.checked);
                if (!e.target.checked) setTransferToAccountId("");
              }}
              aria-label="Transfer to another account"
            />
            <span className="label-text">Transfer to another account</span>
          </label>
          {isTransfer && (
            <select
              className="select select-bordered select-sm w-full mt-2"
              value={transferToAccountId}
              onChange={(e) => setTransferToAccountId(e.target.value)}
            >
              <option value="">Select target account...</option>
              {accounts!.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === "expense" && !isTransfer && (
        <CategoryPicker
          value={category}
          onChange={setCategory}
          categories={categories || []}
        />
      )}

      <div className="flex gap-2 justify-end pt-2">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-sm btn-primary">
          {initial?.name ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}
