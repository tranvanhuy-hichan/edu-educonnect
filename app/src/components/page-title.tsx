import { ToolbarActions } from "@/components/toolbar-actions";

/** Page actions collapse on mobile; navigation controls can opt to stay visible. */
export function Title({ children, right, actionsInline = false, mobileActions = "menu" }: { children: React.ReactNode; right?: React.ReactNode; actionsInline?: boolean; mobileActions?: "menu" | "visible" }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {right && (actionsInline || mobileActions === "menu"
        ? <div className="flex shrink-0 items-center gap-2">{actionsInline ? right : <ToolbarActions>{right}</ToolbarActions>}</div>
        : <div className="flex w-full flex-wrap items-center gap-2 md:w-auto [&>*]:grow md:[&>*]:grow-0">{right}</div>)}
    </div>
  );
}
