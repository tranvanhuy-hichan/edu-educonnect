import { HeadSkeleton, TabsSkeleton, ToolbarSkeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <div><HeadSkeleton /><TabsSkeleton n={4} /><ToolbarSkeleton /><TableSkeleton rows={10} cols={6} /></div>;
}
