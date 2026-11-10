import { ActionMenu } from "@/components/action-menu";

/** Secondary toolbar actions stay available behind ⋯ on mobile. */
export function ToolbarActions({ children, label = "Thao tác" }: { children: React.ReactNode; label?: string }) {
  return <>
    <div className="no-print md:hidden"><ActionMenu label={label} wide>
      <div className="flex flex-col gap-2 [&>button]:w-full [&>button]:justify-start [&>a]:w-full [&>a]:justify-start">{children}</div>
    </ActionMenu></div>
    <div className="no-print hidden flex-wrap items-center gap-2 md:flex">{children}</div>
  </>;
}
