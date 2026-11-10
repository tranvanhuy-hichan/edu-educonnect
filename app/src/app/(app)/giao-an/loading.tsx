import { HeadSkeleton, ToolbarSkeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <div><HeadSkeleton /><ToolbarSkeleton /><TableSkeleton rows={8} cols={4} /></div>;
}
