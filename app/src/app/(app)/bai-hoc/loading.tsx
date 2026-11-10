import { HeadSkeleton, TabsSkeleton, ToolbarSkeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <div><HeadSkeleton /><TabsSkeleton n={3} /><ToolbarSkeleton /><TableSkeleton rows={8} cols={6} /></div>;
}
