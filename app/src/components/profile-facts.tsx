/** Lưới thông tin co giãn theo chiều rộng thực tế của thẻ hồ sơ. */
export function ProfileFacts({ items }: { items: readonly (readonly [string, React.ReactNode])[] }) {
  return (
    <div className="@container text-sm">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className={`min-w-0 ${label === "Địa chỉ" || label === "Ghi chú" ? "@sm:col-span-2" : ""}`}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 whitespace-pre-line font-medium [overflow-wrap:anywhere]">{value == null || value === "" ? "—" : value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
