"use client";
import { Printer } from "lucide-react";
export function PrintButton() { return <button type="button" onClick={() => window.print()} className="no-print inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"><Printer className="size-4" />In lịch thi</button>; }
